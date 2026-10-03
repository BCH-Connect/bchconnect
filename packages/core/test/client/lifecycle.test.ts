import type { DemoAltProtocol, DemoProtocol } from "@bchconnect/test-utils";
import {
	createFakeConnector,
	demoAltSession,
	demoSession,
} from "@bchconnect/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import { TransportError } from "../../src/errors.js";
import { SNAPSHOT_KEY, serializeSnapshot } from "../../src/snapshot.js";
import { memory } from "../../src/storage/memory.js";
import type {
	ClientSnapshot,
	ClientStatus,
	LifecycleEvents,
} from "../../src/types/client.js";
import type {
	Connector,
	ConnectorContext,
	KeyValueStore,
	Logger,
	ProtocolDefinition,
} from "../../src/types/protocol.js";

function snapshotOf(
	currentSessionId: string | null,
	sessionIds: readonly string[],
): ClientSnapshot {
	return {
		version: 1,
		currentSessionId,
		sessions: sessionIds.map((id) => ({
			id,
			protocol: "demo",
			network: "chipnet",
			wallet: { source: "protocol" },
		})),
	};
}

async function persistedStorage(snapshot: ClientSnapshot) {
	const storage = memory();
	await storage.set(SNAPSHOT_KEY, serializeSnapshot(snapshot));
	return storage;
}

function createLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

function createStorage(): KeyValueStore {
	return {
		get: vi.fn(async () => undefined),
		set: vi.fn(async () => {}),
		delete: vi.fn(async () => {}),
	};
}

const appMetadata = { name: "Test", url: "https://example.com" };

function setupClient(
	connectors: readonly Connector[],
	options: {
		ssr?: boolean;
		initialState?: ClientSnapshot;
		storage?: KeyValueStore;
		logger?: Logger;
	} = {},
) {
	const client = createClient({
		connectors,
		network: "chipnet",
		appMetadata,
		...options,
	});
	const errors: LifecycleEvents["client:error"][] = [];
	client.on("client:error", (payload) => errors.push(payload));

	return { client, errors };
}

describe("init", () => {
	it("should set up every connector in registration order", async () => {
		const first = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const second = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
		});
		const setupFirst = vi.spyOn(first, "setup");
		const setupSecond = vi.spyOn(second, "setup");
		const { client } = setupClient([first, second]);

		await client.init();

		expect(setupFirst).toHaveBeenCalledOnce();
		expect(setupSecond).toHaveBeenCalledOnce();
		expect(setupFirst).toHaveBeenCalledBefore(setupSecond);
	});

	it("should wait for one connector's setup before starting the next", async () => {
		let finishSetup = (): void => {};
		const setupDone = new Promise<void>((resolve) => {
			finishSetup = resolve;
		});
		const first = {
			...createFakeConnector<DemoProtocol>({ protocol: "demo" }),
			setup: () => setupDone,
		};
		const second = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
		});
		const { client } = setupClient([first, second]);

		const initialized = client.init();
		await Promise.resolve();

		expect(second.log).toEqual([]);

		finishSetup();
		await initialized;

		expect(second.log).toEqual([{ kind: "setup" }, { kind: "restore" }]);
	});

	it("should return the same promise from every call", async () => {
		const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const { client } = setupClient([connector]);

		const first = client.init();
		const second = client.init();
		await first;

		expect(second).toBe(first);
		expect(client.init()).toBe(first);
		expect(connector.log).toEqual([{ kind: "setup" }, { kind: "restore" }]);
	});

	it("should return the same promise to a call made by a store subscriber", async () => {
		const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const { client } = setupClient([connector]);
		const nested: Promise<void>[] = [];
		client.store.subscribe(() => {
			if (client.status === "restoring") nested.push(client.init());
		});

		const first = client.init();
		await first;

		expect(nested).toHaveLength(1);
		expect(nested[0]).toBe(first);
		expect(connector.log).toEqual([{ kind: "setup" }, { kind: "restore" }]);
	});

	it("should be restoring as soon as init() returns", async () => {
		const { client } = setupClient([
			createFakeConnector<DemoProtocol>({ protocol: "demo" }),
		]);

		const initialized = client.init();

		expect(client.status).toBe("restoring");
		await initialized;
	});

	it("should move from idle through restoring to ready", async () => {
		const { client } = setupClient([
			createFakeConnector<DemoProtocol>({ protocol: "demo" }),
		]);
		const statuses: ClientStatus[] = [];
		client.store.subscribe(() => statuses.push(client.status));

		await client.init();

		expect(statuses).toEqual(["restoring", "ready"]);
	});

	it("should go from restoring straight to ready under ssr", async () => {
		const { client } = setupClient(
			[createFakeConnector<DemoProtocol>({ protocol: "demo" })],
			{ ssr: true },
		);
		const statuses: ClientStatus[] = [];
		client.store.subscribe(() => statuses.push(client.status));

		await client.init();

		expect(statuses).toEqual(["ready"]);
	});

	it("should become ready with no connectors", async () => {
		const { client } = setupClient([]);

		await client.init();

		expect(client.status).toBe("ready");
	});

	it("should report a failed setup as a CONFIG client error", async () => {
		const connector = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			setup: "throw",
		});
		const { client, errors } = setupClient([connector]);

		await client.init();

		expect(errors).toEqual([
			{
				error: expect.objectContaining({
					code: "CONFIG",
					message: 'Connector "demo" failed setup',
					cause: expect.objectContaining({
						message: 'Fake connector "demo" failed setup.',
					}),
				}),
			},
		]);
	});

	it("should report a library error thrown by setup unchanged", async () => {
		const failure = new TransportError("Relay unreachable");
		const connector = {
			...createFakeConnector<DemoProtocol>({ protocol: "demo" }),
			setup: () => Promise.reject(failure),
		};
		const { client, errors } = setupClient([connector]);

		await client.init();

		expect(errors).toEqual([{ error: failure }]);
	});

	it("should keep setting up the other connectors after a failed setup", async () => {
		const failing = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			setup: "throw",
		});
		const healthy = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
		});
		const { client } = setupClient([failing, healthy]);

		await client.init();

		expect(healthy.log).toEqual([{ kind: "setup" }, { kind: "restore" }]);
		expect(client.status).toBe("ready");
	});

	it("should stop reporting client errors to a listener that unsubscribed", async () => {
		const client = createClient({
			connectors: [
				createFakeConnector<DemoProtocol>({ protocol: "demo", setup: "throw" }),
			],
			network: "chipnet",
			appMetadata,
		});
		const listener = vi.fn();
		const off = client.on("client:error", listener);

		off();
		await client.init();

		expect(listener).not.toHaveBeenCalled();
	});

	describe("restore", () => {
		it("should restore the sessions of every connector in registration order", async () => {
			const alt = demoAltSession({ id: "alt" });
			const first = demoSession({ id: "first" });
			const second = demoSession({ id: "second" });
			const { client } = setupClient([
				createFakeConnector<DemoAltProtocol>({
					protocol: "demo-alt",
					restore: [alt],
				}),
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: [first, second],
				}),
			]);

			await client.init();

			expect([...client.sessions.values()]).toEqual([alt, first, second]);
		});

		it("should call only setup and restore on a connector with nothing persisted", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
			});
			const storage = createStorage();
			const { client } = setupClient([connector], { storage });

			await client.init();

			expect(connector.log).toEqual([{ kind: "setup" }, { kind: "restore" }]);
			expect(client.sessions.size).toBe(0);
			expect(storage.set).not.toHaveBeenCalled();
			expect(storage.delete).not.toHaveBeenCalled();
		});

		it("should not restore a connector whose setup failed", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				setup: "throw",
				restore: [demoSession()],
			});
			const { client } = setupClient([connector]);

			await client.init();

			expect(connector.log).toEqual([{ kind: "setup" }]);
			expect(client.protocols).toEqual(["demo"]);
			expect(client.sessions.size).toBe(0);
		});

		it("should report a failed restore as a TRANSPORT client error and keep the others", async () => {
			const alt = demoAltSession({ id: "alt" });
			const { client, errors } = setupClient([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: "throw",
				}),
				createFakeConnector<DemoAltProtocol>({
					protocol: "demo-alt",
					restore: [alt],
				}),
			]);

			await client.init();

			expect(errors).toEqual([
				{
					error: expect.objectContaining({
						code: "TRANSPORT",
						message: 'restore() failed for connector "demo"',
						cause: expect.objectContaining({
							message: 'Fake connector "demo" failed restore.',
						}),
					}),
				},
			]);
			expect([...client.sessions.values()]).toEqual([alt]);
			expect(client.status).toBe("ready");
		});

		it("should report a library error thrown by restore unchanged", async () => {
			const failure = new TransportError("Relay unreachable");
			const { client, errors } = setupClient([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: () => Promise.reject(failure),
				}),
			]);

			await client.init();

			expect(errors).toEqual([{ error: failure }]);
		});

		describe("deadline", () => {
			beforeEach(() => {
				vi.useFakeTimers();
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			function hangingConnector() {
				return createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: () => new Promise(() => {}),
				});
			}

			it("should give up on a restore that outlasts the read timeout and keep the others", async () => {
				const alt = demoAltSession({ id: "alt" });
				const { client, errors } = setupClient([
					hangingConnector(),
					createFakeConnector<DemoAltProtocol>({
						protocol: "demo-alt",
						restore: [alt],
					}),
				]);

				const initialized = client.init();
				await vi.advanceTimersByTimeAsync(30_000);
				await initialized;

				expect(errors).toEqual([
					{
						error: expect.objectContaining({
							code: "TIMEOUT",
							message: 'restore() timed out for connector "demo"',
						}),
					},
				]);
				expect([...client.sessions.values()]).toEqual([alt]);
				expect(client.status).toBe("ready");
			});

			it("should still be restoring just before the read timeout", async () => {
				const { client } = setupClient([hangingConnector()]);

				void client.init();
				await vi.advanceTimersByTimeAsync(29_999);

				expect(client.status).toBe("restoring");
			});

			it("should give up on a snapshot read that outlasts the read timeout", async () => {
				const storage = {
					...createStorage(),
					get: () => new Promise<undefined>(() => {}),
				};
				const { client, errors } = setupClient(
					[
						createFakeConnector<DemoProtocol>({
							protocol: "demo",
							restore: [demoSession({ id: "first" })],
						}),
					],
					{ storage },
				);

				const initialized = client.init();
				await vi.advanceTimersByTimeAsync(30_000);
				await initialized;

				expect(errors).toEqual([
					{
						error: expect.objectContaining({
							code: "TIMEOUT",
							message: "Reading the client snapshot timed out",
						}),
					},
				]);
				expect(client.current?.id).toBe("first");
				expect(client.status).toBe("ready");
			});

			it("should use the configured read timeout", async () => {
				const client = createClient({
					connectors: [hangingConnector()],
					network: "chipnet",
					appMetadata,
					defaultTimeoutMs: { read: 5_000 },
				});
				const errors: LifecycleEvents["client:error"][] = [];
				client.on("client:error", (payload) => errors.push(payload));

				const initialized = client.init();
				await vi.advanceTimersByTimeAsync(4_999);
				expect(client.status).toBe("restoring");

				await vi.advanceTimersByTimeAsync(1);
				await initialized;

				expect(client.status).toBe("ready");
				expect(errors).toEqual([
					{ error: expect.objectContaining({ code: "TIMEOUT" }) },
				]);
			});
		});

		it("should not announce restored sessions as connected", async () => {
			const { client } = setupClient([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: [demoSession()],
				}),
			]);
			const connected = vi.fn();
			client.on("session:connected", connected);

			await client.init();

			expect(connected).not.toHaveBeenCalled();
		});

		it("should publish the restored sessions, the current one and ready in one transition", async () => {
			const { client } = setupClient([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: [demoSession({ id: "first" })],
				}),
			]);
			const seen: [ClientStatus, number, string | null][] = [];
			client.store.subscribe(() => {
				const state = client.store.getState();
				seen.push([state.status, state.sessions.size, state.currentSessionId]);
			});

			await client.init();

			expect(seen).toEqual([
				["restoring", 0, null],
				["ready", 1, "first"],
			]);
		});
	});

	describe("current session", () => {
		const connector = () =>
			createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [demoSession({ id: "first" }), demoSession({ id: "second" })],
			});

		it("should keep the session the stored snapshot marked current", async () => {
			const storage = await persistedStorage(
				snapshotOf("second", ["first", "second"]),
			);
			const { client } = setupClient([connector()], { storage });

			await client.init();

			expect(client.current?.id).toBe("second");
		});

		it("should keep the session the ssr snapshot marked current", async () => {
			const { client } = setupClient([connector()], {
				ssr: true,
				initialState: snapshotOf("second", ["first", "second"]),
			});

			await client.init();

			expect(client.current?.id).toBe("second");
		});

		it("should fall back to the first restored session when the marked one is gone", async () => {
			const storage = await persistedStorage(
				snapshotOf("gone", ["gone", "second"]),
			);
			const { client } = setupClient([connector()], { storage });

			await client.init();

			expect(client.current?.id).toBe("first");
		});

		it("should fall back to the first restored session without a snapshot", async () => {
			const { client } = setupClient([connector()]);

			await client.init();

			expect(client.current?.id).toBe("first");
		});

		it("should fall back to the first restored session when the snapshot has no current", async () => {
			const storage = await persistedStorage(
				snapshotOf(null, ["first", "second"]),
			);
			const { client } = setupClient([connector()], { storage });

			await client.init();

			expect(client.current?.id).toBe("first");
		});

		it("should have no current session when nothing was restored", async () => {
			const { client } = setupClient([
				createFakeConnector<DemoProtocol>({ protocol: "demo" }),
			]);

			await client.init();

			expect(client.current).toBeNull();
		});

		it("should derive the current session from the store", async () => {
			const { client } = setupClient([connector()]);

			await client.init();
			const { sessions, currentSessionId } = client.store.getState();

			expect(currentSessionId).toBe("first");
			expect(client.current).toBe(sessions.get("first"));
		});

		it("should fall back to the first restored session when the stored snapshot is corrupt", async () => {
			const storage = memory();
			await storage.set(SNAPSHOT_KEY, "{not json");
			const logger = createLogger();
			const { client, errors } = setupClient([connector()], {
				storage,
				logger,
			});

			await client.init();

			expect(client.current?.id).toBe("first");
			expect(errors).toEqual([]);
			expect(logger.debug).toHaveBeenCalledWith(
				"Discarding unparsable client snapshot",
				expect.any(SyntaxError),
			);
		});

		it("should report unreadable storage as a TRANSPORT client error and restore anyway", async () => {
			const failure = new Error("Storage unavailable");
			const storage = {
				...createStorage(),
				get: () => Promise.reject(failure),
			};
			const { client, errors } = setupClient([connector()], { storage });

			await client.init();

			expect(errors).toEqual([
				{
					error: expect.objectContaining({
						code: "TRANSPORT",
						message: "Reading the client snapshot failed",
						cause: failure,
					}),
				},
			]);
			expect(client.current?.id).toBe("first");
		});
	});

	describe("connector context", () => {
		function captureContexts(protocols: readonly string[]) {
			const contexts = new Map<string, ConnectorContext>();
			const connectors = protocols.map((protocol) => ({
				...createFakeConnector<ProtocolDefinition>({ protocol }),
				setup(ctx: ConnectorContext) {
					contexts.set(protocol, ctx);
				},
			}));

			function contextOf(protocol: string) {
				const context = contexts.get(protocol);
				if (context === undefined) {
					throw new Error(`"${protocol}" was never set up`);
				}
				return context;
			}

			return { connectors, contextOf };
		}

		it("should hand each connector the client's network, app metadata and logger", async () => {
			const logger = createLogger();
			const { connectors, contextOf } = captureContexts(["demo"]);
			const { client } = setupClient(connectors, { logger });

			await client.init();

			expect(contextOf("demo")).toMatchObject({
				network: "chipnet",
				appMetadata,
				logger,
			});
		});

		it("should give each connector storage that no other connector sees", async () => {
			const { connectors, contextOf } = captureContexts(["demo", "demo-alt"]);
			const { client } = setupClient(connectors);
			await client.init();

			await contextOf("demo").storage.set("credentials", "secret");

			await expect(contextOf("demo").storage.get("credentials")).resolves.toBe(
				"secret",
			);
			await expect(
				contextOf("demo-alt").storage.get("credentials"),
			).resolves.toBeUndefined();
		});

		it("should never write connector storage to the client's storage", async () => {
			const storage = createStorage();
			const { connectors, contextOf } = captureContexts(["demo"]);
			const client = createClient({
				connectors,
				network: "chipnet",
				appMetadata,
				storage,
			});
			await client.init();

			await contextOf("demo").storage.set("credentials", "secret");

			expect(storage.set).not.toHaveBeenCalled();
		});

		it("should not turn a connector's session events into client events or state", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
			});
			const { client } = setupClient([connector]);
			const connected = vi.fn();
			client.on("session:connected", connected);
			await client.init();
			const state = client.store.getState();

			connector.emit("session:connected", { session: demoSession() });

			expect(connected).not.toHaveBeenCalled();
			expect(client.store.getState()).toBe(state);
		});
	});
});
