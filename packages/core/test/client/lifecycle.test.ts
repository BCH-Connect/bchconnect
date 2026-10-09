import type { DemoAltProtocol, DemoProtocol } from "@bchconnect/test-utils";
import {
	createFakeConnector,
	demoAltSession,
	demoSession,
} from "@bchconnect/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import { createLifecycle } from "../../src/client/lifecycle.js";
import { createLifetime } from "../../src/client/lifetime.js";
import { createClientRuntime } from "../../src/client/runtime.js";
import { TransportError } from "../../src/errors.js";
import {
	SNAPSHOT_KEY,
	serializeSnapshot,
	toSnapshot,
} from "../../src/snapshot.js";
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

// Lets queued storage writes run.
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
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
				snapshotOf("first", ["first", "second"]),
			);
			const { client } = setupClient([connector()], { storage });

			await client.init();

			expect(client.current?.id).toBe("first");
		});

		it("should keep the session the ssr snapshot marked current", async () => {
			const { client } = setupClient([connector()], {
				ssr: true,
				initialState: snapshotOf("first", ["first", "second"]),
			});

			await client.init();

			expect(client.current?.id).toBe("first");
		});

		it("should promote no session when the marked one is gone", async () => {
			const storage = await persistedStorage(
				snapshotOf("gone", ["gone", "second"]),
			);
			const { client } = setupClient([connector()], { storage });

			await client.init();

			expect(client.sessions.size).toBe(2);
			expect(client.current).toBeNull();
		});

		it("should keep a snapshot with no current session that way", async () => {
			const storage = await persistedStorage(
				snapshotOf(null, ["first", "second"]),
			);
			const { client } = setupClient([connector()], { storage });

			await client.init();

			expect(client.current).toBeNull();
		});

		it("should fall back to the newest restored session without a snapshot", async () => {
			const { client } = setupClient([connector()]);

			await client.init();

			expect(client.current?.id).toBe("second");
		});

		it("should keep the connection order the snapshot saved", async () => {
			const storage = await persistedStorage(
				snapshotOf(null, ["second", "first"]),
			);
			const { client } = setupClient([connector()], { storage });

			await client.init();

			expect([...client.sessions.keys()]).toEqual(["second", "first"]);
		});

		it("should put sessions the snapshot doesn't list last, in restore order", async () => {
			const storage = await persistedStorage(snapshotOf(null, ["second"]));
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [
							demoSession({ id: "first" }),
							demoSession({ id: "second" }),
							demoSession({ id: "third" }),
						],
					}),
				],
				{ storage },
			);

			await client.init();

			expect([...client.sessions.keys()]).toEqual(["second", "first", "third"]);
		});

		it("should order by the snapshot and pick its current session by id", async () => {
			const storage = await persistedStorage(
				snapshotOf("first", ["gone", "second", "first"]),
			);
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [
							demoSession({ id: "first" }),
							demoSession({ id: "third" }),
							demoSession({ id: "second" }),
						],
					}),
				],
				{ storage },
			);

			await client.init();

			expect([...client.sessions.keys()]).toEqual(["second", "first", "third"]);
			expect(client.current?.id).toBe("first");
		});

		it("should order sessions across connectors by the snapshot", async () => {
			const snapshot = snapshotOf(null, ["first", "alt"]);
			const storage = await persistedStorage({
				...snapshot,
				sessions: snapshot.sessions.map((entry) =>
					entry.id === "alt" ? { ...entry, protocol: "demo-alt" } : entry,
				),
			});
			const { client } = setupClient(
				[
					createFakeConnector<DemoAltProtocol>({
						protocol: "demo-alt",
						restore: [demoAltSession({ id: "alt" })],
					}),
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [demoSession({ id: "first" })],
					}),
				],
				{ storage },
			);

			await client.init();

			expect([...client.sessions.keys()]).toEqual(["first", "alt"]);
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

			expect(currentSessionId).toBe("second");
			expect(client.current).toBe(sessions.get("second"));
		});

		it("should fall back to the newest restored session when the stored snapshot is corrupt", async () => {
			const storage = memory();
			await storage.set(SNAPSHOT_KEY, "{not json");
			const logger = createLogger();
			const { client, errors } = setupClient([connector()], {
				storage,
				logger,
			});

			await client.init();

			expect(client.current?.id).toBe("second");
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
			expect(client.current?.id).toBe("second");
		});
	});

	describe("ssr reconciliation", () => {
		it("should announce every ssr snapshot session that did not come back as expired", async () => {
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [demoSession({ id: "kept" })],
					}),
				],
				{ ssr: true, initialState: snapshotOf("kept", ["kept", "gone"]) },
			);
			const disconnected = vi.fn();
			client.on("session:disconnected", disconnected);

			await client.init();

			expect(disconnected).toHaveBeenCalledExactlyOnceWith({
				sessionId: "gone",
				reason: "expired",
			});
		});

		it("should announce each lost session in snapshot order, including those of a connector whose setup failed", async () => {
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						setup: "throw",
						restore: [demoSession({ id: "first" })],
					}),
				],
				{
					ssr: true,
					initialState: snapshotOf("first", ["first", "second"]),
				},
			);
			const expired: string[] = [];
			client.on("session:disconnected", ({ sessionId }) => {
				expired.push(sessionId);
			});

			await client.init();

			expect(expired).toEqual(["first", "second"]);
		});

		it("should clear the snapshot once init resolves", async () => {
			const { client } = setupClient(
				[createFakeConnector<DemoProtocol>({ protocol: "demo" })],
				{ ssr: true, initialState: snapshotOf("gone", ["gone"]) },
			);

			await client.init();

			expect(client.store.getState().snapshot).toBeNull();
			expect(client.status).toBe("ready");
		});

		it("should announce expired sessions after the state is ready and before init resolves", async () => {
			const { client } = setupClient(
				[createFakeConnector<DemoProtocol>({ protocol: "demo" })],
				{ ssr: true, initialState: snapshotOf("gone", ["gone"]) },
			);
			let resolved = false;
			const seen: [ClientStatus, boolean, boolean][] = [];
			client.on("session:disconnected", () => {
				const state = client.store.getState();
				seen.push([state.status, state.snapshot === null, resolved]);
			});

			await client.init().then(() => {
				resolved = true;
			});

			expect(seen).toEqual([["ready", true, false]]);
		});

		it("should not announce sessions that only the stored snapshot listed", async () => {
			const storage = await persistedStorage(snapshotOf("gone", ["gone"]));
			const { client } = setupClient(
				[createFakeConnector<DemoProtocol>({ protocol: "demo" })],
				{ storage },
			);
			const disconnected = vi.fn();
			client.on("session:disconnected", disconnected);

			await client.init();

			expect(disconnected).not.toHaveBeenCalled();
		});
	});

	describe("saved wallet identity", () => {
		function savedSnapshot(
			entry: Partial<ClientSnapshot["sessions"][number]>,
		): ClientSnapshot {
			return {
				version: 1,
				currentSessionId: null,
				sessions: [
					{
						id: "first",
						protocol: "demo",
						network: "chipnet",
						wallet: { id: "cashonize", name: "Cashonize", source: "selection" },
						...entry,
					},
				],
			};
		}

		async function restoreWith(
			restored: ReturnType<typeof demoSession>,
			snapshot: ClientSnapshot,
		) {
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [restored],
					}),
				],
				{ storage: await persistedStorage(snapshot) },
			);
			await client.init();
			return client.sessions.get(restored.id);
		}

		it("should put back the saved wallet identity of the same session", async () => {
			const restored = demoSession({
				id: "first",
				wallet: { source: "protocol" },
			});

			const session = await restoreWith(restored, savedSnapshot({}));

			expect(session?.wallet).toStrictEqual({
				id: "cashonize",
				name: "Cashonize",
				source: "selection",
			});
		});

		it("should keep the fields the protocol supplied on restore", async () => {
			const restored = demoSession({
				id: "first",
				wallet: { name: "Paytaca", source: "protocol" },
			});

			const session = await restoreWith(restored, savedSnapshot({}));

			expect(session?.wallet).toStrictEqual({
				id: "cashonize",
				name: "Paytaca",
				source: "protocol",
			});
		});

		it("should ignore a saved entry for another protocol", async () => {
			const restored = demoSession({
				id: "first",
				wallet: { source: "protocol" },
			});

			const session = await restoreWith(
				restored,
				savedSnapshot({ protocol: "demo-alt" }),
			);

			expect(session).toBe(restored);
		});

		it("should ignore a saved entry for another network", async () => {
			const restored = demoSession({
				id: "first",
				wallet: { source: "protocol" },
			});

			const session = await restoreWith(
				restored,
				savedSnapshot({ network: "mainnet" }),
			);

			expect(session).toBe(restored);
		});

		it("should keep a session with no saved entry as the connector returned it", async () => {
			const restored = demoSession({
				id: "other",
				wallet: { source: "protocol" },
			});

			const session = await restoreWith(restored, savedSnapshot({}));

			expect(session).toBe(restored);
		});

		it("should put back the wallet identity saved in the ssr snapshot", async () => {
			const restored = demoSession({
				id: "first",
				wallet: { source: "protocol" },
			});
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [restored],
					}),
				],
				{ ssr: true, initialState: savedSnapshot({}) },
			);

			await client.init();

			expect(client.sessions.get("first")?.wallet.name).toBe("Cashonize");
		});

		it("should put back a name the protocol sent at connect but not on restore, still as the protocol's", async () => {
			const restored = demoSession({
				id: "first",
				wallet: { source: "protocol" },
			});

			const session = await restoreWith(
				restored,
				savedSnapshot({ wallet: { name: "Paytaca", source: "protocol" } }),
			);

			expect(session?.wallet).toStrictEqual({
				name: "Paytaca",
				source: "protocol",
			});
		});

		it("should keep a picked id next to the protocol's name across reloads", async () => {
			const storage = await persistedStorage(
				toSnapshot(
					{
						sessions: new Map([
							[
								"first",
								demoSession({
									id: "first",
									wallet: {
										id: "paytaca",
										name: "Paytaca",
										source: "protocol",
									},
								}),
							],
						]),
						currentSessionId: "first",
					},
					"chipnet",
				),
			);
			const set = vi.spyOn(storage, "set");

			for (let reload = 0; reload < 2; reload++) {
				const { client } = setupClient(
					[
						createFakeConnector<DemoProtocol>({
							protocol: "demo",
							restore: [
								demoSession({
									id: "first",
									wallet: { name: "Paytaca", source: "protocol" },
								}),
							],
						}),
					],
					{ storage },
				);
				await client.init();
				await settle();

				expect(client.sessions.get("first")?.wallet).toStrictEqual({
					id: "paytaca",
					name: "Paytaca",
					source: "protocol",
				});
			}
			expect(set).not.toHaveBeenCalled();
		});

		it("should not rewrite the stored snapshot when the restored session matches it", async () => {
			// Built the way the client writes it, so the key order matches.
			const snapshot = toSnapshot(
				{
					sessions: new Map([
						[
							"first",
							demoSession({
								id: "first",
								wallet: {
									id: "cashonize",
									name: "Cashonize",
									source: "selection",
								},
							}),
						],
					]),
					currentSessionId: "first",
				},
				"chipnet",
			);
			const storage = await persistedStorage(snapshot);
			const set = vi.spyOn(storage, "set");
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [
							demoSession({ id: "first", wallet: { source: "protocol" } }),
						],
					}),
				],
				{ storage },
			);

			await client.init();
			await settle();

			expect(client.sessions.get("first")?.wallet).toStrictEqual(
				snapshot.sessions[0]?.wallet,
			);
			expect(set).not.toHaveBeenCalled();
		});

		it("should never mutate the session the connector restored", async () => {
			const restored = demoSession({
				id: "first",
				wallet: { source: "protocol" },
			});
			const wallet = restored.wallet;

			await restoreWith(restored, savedSnapshot({}));

			expect(restored.wallet).toBe(wallet);
			expect(wallet).toStrictEqual({ source: "protocol" });
		});
	});

	describe("persistence", () => {
		it("should persist the restored sessions and the current one", async () => {
			const first = demoSession({ id: "first" });
			const storage = memory();
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [first],
					}),
				],
				{ storage },
			);

			await client.init();
			await settle();

			await expect(storage.get(SNAPSHOT_KEY)).resolves.toBe(
				serializeSnapshot(
					toSnapshot(
						{
							sessions: new Map([["first", first]]),
							currentSessionId: "first",
						},
						"chipnet",
					),
				),
			);
		});

		it("should not rewrite a snapshot that already matches the restored state", async () => {
			const first = demoSession({ id: "first" });
			const storage = await persistedStorage(
				toSnapshot(
					{ sessions: new Map([["first", first]]), currentSessionId: "first" },
					"chipnet",
				),
			);
			const set = vi.spyOn(storage, "set");
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [first],
					}),
				],
				{ storage },
			);

			await client.init();
			await settle();

			expect(set).not.toHaveBeenCalled();
		});

		it("should delete the stored snapshot when nothing comes back", async () => {
			const storage = await persistedStorage(snapshotOf("gone", ["gone"]));
			const { client } = setupClient(
				[createFakeConnector<DemoProtocol>({ protocol: "demo" })],
				{ storage },
			);

			await client.init();
			await settle();

			await expect(storage.get(SNAPSHOT_KEY)).resolves.toBeUndefined();
		});

		it("should write nothing when nothing was persisted or restored", async () => {
			const storage = createStorage();
			const { client } = setupClient(
				[createFakeConnector<DemoProtocol>({ protocol: "demo" })],
				{ storage },
			);

			await client.init();
			await settle();

			expect(storage.set).not.toHaveBeenCalled();
			expect(storage.delete).not.toHaveBeenCalled();
		});

		it("should compare against the ssr snapshot instead of reading storage", async () => {
			const first = demoSession({ id: "first" });
			const storage = createStorage();
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [first],
					}),
				],
				{
					ssr: true,
					initialState: toSnapshot(
						{
							sessions: new Map([["first", first]]),
							currentSessionId: "first",
						},
						"chipnet",
					),
					storage,
				},
			);

			await client.init();
			await settle();

			expect(storage.get).not.toHaveBeenCalled();
			expect(storage.set).not.toHaveBeenCalled();
		});

		it("should report a failed write as a TRANSPORT client error", async () => {
			const failure = new Error("Quota exceeded");
			const storage = {
				...createStorage(),
				set: () => Promise.reject(failure),
			};
			const { client, errors } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: [demoSession()],
					}),
				],
				{ storage },
			);

			await client.init();
			await settle();

			expect(errors).toEqual([
				{
					error: expect.objectContaining({
						code: "TRANSPORT",
						message: "Writing the client snapshot failed",
						cause: failure,
					}),
				},
			]);
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

describe("dispose", () => {
	// A promise that settles only through `open()`.
	function gate<T>(value: T) {
		let open = () => {};
		const promise = new Promise<T>((resolve) => {
			open = () => resolve(value);
		});
		return { promise, open };
	}

	it("should become disposed and keep its sessions without disconnecting them", async () => {
		const connector = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			restore: [demoSession({ id: "first" })],
		});
		const { client } = setupClient([connector]);
		await client.init();

		await client.dispose();

		expect(client.status).toBe("disposed");
		expect([...client.sessions.keys()]).toEqual(["first"]);
		expect(connector.log).toEqual([
			{ kind: "setup" },
			{ kind: "restore" },
			{ kind: "dispose" },
		]);
	});

	it("should be disposed as soon as dispose() returns", () => {
		const { client } = setupClient([
			createFakeConnector<DemoProtocol>({ protocol: "demo" }),
		]);

		void client.dispose();

		expect(client.status).toBe("disposed");
	});

	it("should dispose every connector in registration order", async () => {
		const first = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const second = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
		});
		const disposeFirst = vi.spyOn(first, "dispose");
		const disposeSecond = vi.spyOn(second, "dispose");
		const { client } = setupClient([first, second]);

		await client.dispose();

		expect(disposeFirst).toHaveBeenCalledBefore(disposeSecond);
	});

	it("should report a connector that fails to dispose and still dispose the others", async () => {
		const healthy = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
		});
		const { client, errors } = setupClient([
			createFakeConnector<DemoProtocol>({ protocol: "demo", dispose: "throw" }),
			healthy,
		]);

		await client.dispose();

		expect(errors).toEqual([
			{
				error: expect.objectContaining({
					code: "TRANSPORT",
					message: 'Connector "demo" failed to dispose',
					cause: expect.objectContaining({
						message: 'Fake connector "demo" failed dispose.',
					}),
				}),
			},
		]);
		expect(healthy.log).toEqual([{ kind: "dispose" }]);
	});

	it("should report a library error thrown by dispose unchanged", async () => {
		const failure = new TransportError("Relay unreachable");
		const { client, errors } = setupClient([
			{
				...createFakeConnector<DemoProtocol>({ protocol: "demo" }),
				dispose: () => Promise.reject(failure),
			},
		]);

		await client.dispose();

		expect(errors).toEqual([{ error: failure }]);
	});

	it("should return the same promise from every call", async () => {
		const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const { client } = setupClient([connector]);

		const first = client.dispose();
		const second = client.dispose();
		await first;

		expect(second).toBe(first);
		expect(client.dispose()).toBe(first);
		expect(connector.log).toEqual([{ kind: "dispose" }]);
	});

	it("should dispose a client that was never initialized", async () => {
		const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const { client } = setupClient([connector]);

		await client.dispose();

		expect(client.status).toBe("disposed");
		expect(connector.log).toEqual([{ kind: "dispose" }]);
	});

	it("should empty the pending requests", async () => {
		const runtime = createClientRuntime({
			connectors: [],
			network: "chipnet",
			appMetadata,
		});
		runtime.store.setState((state) => ({
			...state,
			pendingRequests: new Map([
				[
					"request-1",
					{
						sessionId: "first",
						method: "sign_message",
						userInteraction: true,
						startedAt: 0,
					},
				],
			]),
		}));

		await createLifecycle(runtime, createLifetime(), () => {}).dispose();

		expect(runtime.store.getState().pendingRequests.size).toBe(0);
	});

	it("should remove every listener", async () => {
		const runtime = createClientRuntime({
			connectors: [],
			network: "chipnet",
			appMetadata,
		});
		const listener = vi.fn();
		runtime.events.on("client:error", listener);

		await createLifecycle(runtime, createLifetime(), () => {}).dispose();
		runtime.events.emit("client:error", {
			error: new TransportError("After dispose"),
		});

		expect(listener).not.toHaveBeenCalled();
	});

	it("should wait for queued snapshot writes before resolving", async () => {
		const write = gate(undefined);
		const storage = { ...createStorage(), set: () => write.promise };
		const { client } = setupClient(
			[
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: [demoSession()],
				}),
			],
			{ storage },
		);
		await client.init();
		let disposed = false;

		const disposing = client.dispose().then(() => {
			disposed = true;
		});
		await settle();
		expect(disposed).toBe(false);

		write.open();
		await disposing;
		expect(disposed).toBe(true);
	});

	describe("during init", () => {
		it("should let init resolve without publishing the restored sessions", async () => {
			const restored = gate([demoSession({ id: "first" })]);
			const storage = createStorage();
			const { client } = setupClient(
				[
					createFakeConnector<DemoProtocol>({
						protocol: "demo",
						restore: () => restored.promise,
					}),
				],
				{
					ssr: true,
					initialState: snapshotOf("gone", ["gone"]),
					storage,
				},
			);
			const disconnected = vi.fn();
			client.on("session:disconnected", disconnected);
			const initialized = client.init();
			await settle();

			await client.dispose();
			restored.open();
			await initialized;
			await settle();

			expect(client.status).toBe("disposed");
			expect(client.sessions.size).toBe(0);
			expect(disconnected).not.toHaveBeenCalled();
			expect(storage.set).not.toHaveBeenCalled();
		});

		it("should set up no further connector", async () => {
			const setupDone = gate(undefined);
			const second = createFakeConnector<DemoAltProtocol>({
				protocol: "demo-alt",
			});
			const { client } = setupClient([
				{
					...createFakeConnector<DemoProtocol>({ protocol: "demo" }),
					setup: () => setupDone.promise,
				},
				second,
			]);
			const initialized = client.init();

			await client.dispose();
			setupDone.open();
			await initialized;

			expect(second.log).toEqual([{ kind: "dispose" }]);
		});

		it("should restore nothing when disposed during the last setup", async () => {
			const setupDone = gate(undefined);
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
			const { client } = setupClient([
				{ ...connector, setup: () => setupDone.promise },
			]);
			const initialized = client.init();

			await client.dispose();
			setupDone.open();
			await initialized;

			expect(connector.log).toEqual([{ kind: "dispose" }]);
		});
	});
});

describe("lifetime", () => {
	function setup(connectors: readonly Connector[] = []) {
		const runtime = createClientRuntime({
			connectors,
			network: "chipnet",
			appMetadata,
		});
		const lifetime = createLifetime();
		return {
			lifetime,
			lifecycle: createLifecycle(runtime, lifetime, () => {}),
		};
	}

	it("should start with init() and resolve whenReady() once init() has", async () => {
		const { lifetime, lifecycle } = setup([
			createFakeConnector<DemoProtocol>({ protocol: "demo" }),
		]);

		const initialized = lifecycle.init();

		await expect(lifetime.whenReady("connect")).resolves.toBeUndefined();
		await initialized;
	});

	it("should end with dispose()", async () => {
		const { lifetime, lifecycle } = setup();

		await lifecycle.dispose();

		expect(lifetime.signal.aborted).toBe(true);
	});
});
