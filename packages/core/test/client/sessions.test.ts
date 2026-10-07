import type {
	DemoAltProtocol,
	DemoProtocol,
	FakeConnector,
} from "@bchconnect/test-utils";
import {
	createFakeConnector,
	demoAltSession,
	demoSession,
} from "@bchconnect/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import {
	keepWalletIdentity,
	mergeWalletIdentity,
} from "../../src/client/sessions.js";
import type {
	Connector,
	ConnectorContext,
	Logger,
	Session,
} from "../../src/types/protocol.js";

type FakeDemo = FakeConnector<DemoProtocol>;
type DemoClient = ReturnType<typeof createClient<readonly [FakeDemo]>>;

// Lets background work run.
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

describe("sessions", () => {
	it("should build a scripted connector from the test utilities", () => {
		const connector = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			session: demoSession,
		});

		expect(connector.protocol).toBe("demo");
		expect(connector.log).toEqual([]);
	});
});

describe("mergeWalletIdentity", () => {
	it("should return the same session when there is no selection", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		expect(mergeWalletIdentity(session)).toBe(session);
	});

	it("should return the same session when the selection is empty", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		expect(mergeWalletIdentity(session, {})).toBe(session);
	});

	it("should return the same session when the selection fills no gap", () => {
		const session = demoSession({
			wallet: { icon: "https://example.com/paytaca.svg", source: "protocol" },
		});

		expect(
			mergeWalletIdentity(session, {
				icon: "https://example.com/cashonize.svg",
			}),
		).toBe(session);
	});

	it("should fill every missing field from the selection", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const merged = mergeWalletIdentity(session, {
			id: "cashonize",
			name: "Cashonize",
			icon: "https://example.com/cashonize.svg",
		});

		expect(merged.wallet).toStrictEqual({
			id: "cashonize",
			name: "Cashonize",
			icon: "https://example.com/cashonize.svg",
			source: "selection",
		});
	});

	it("should keep the fields the protocol supplied", () => {
		const session = demoSession({
			wallet: {
				id: "paytaca",
				name: "Paytaca",
				icon: "https://example.com/paytaca.svg",
				source: "protocol",
			},
		});

		const merged = mergeWalletIdentity(session, {
			id: "cashonize",
			name: "Cashonize",
			icon: "https://example.com/cashonize.svg",
		});

		expect(merged.wallet).toStrictEqual({
			id: "paytaca",
			name: "Paytaca",
			icon: "https://example.com/paytaca.svg",
			source: "protocol",
		});
	});

	it("should combine protocol fields with selection fields", () => {
		const session = demoSession({
			wallet: { icon: "https://example.com/paytaca.svg", source: "protocol" },
		});

		const merged = mergeWalletIdentity(session, {
			id: "paytaca",
			name: "Paytaca",
		});

		expect(merged.wallet).toStrictEqual({
			id: "paytaca",
			name: "Paytaca",
			icon: "https://example.com/paytaca.svg",
			source: "selection",
		});
	});

	it("should mark the protocol as the source when it supplied a name", () => {
		const session = demoSession({
			wallet: { name: "Paytaca", source: "protocol" },
		});

		const merged = mergeWalletIdentity(session, {
			id: "paytaca",
			icon: "https://example.com/paytaca.svg",
		});

		expect(merged.wallet.source).toBe("protocol");
	});

	it("should mark the selection as the source when the protocol supplied no name", () => {
		const session = demoSession({
			wallet: { id: "paytaca", source: "protocol" },
		});

		const merged = mergeWalletIdentity(session, { name: "Paytaca" });

		expect(merged.wallet.source).toBe("selection");
	});

	it("should mark the selection as the source when neither side supplied a name", () => {
		const session = demoSession({
			wallet: { icon: "https://example.com/paytaca.svg", source: "protocol" },
		});

		const merged = mergeWalletIdentity(session, { id: "paytaca" });

		expect(merged.wallet).toStrictEqual({
			id: "paytaca",
			icon: "https://example.com/paytaca.svg",
			source: "selection",
		});
	});

	it("should leave out fields that neither side supplied", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const merged = mergeWalletIdentity(session, {
			icon: "https://example.com/cashonize.svg",
		});

		expect(merged.wallet).toStrictEqual({
			icon: "https://example.com/cashonize.svg",
			source: "selection",
		});
	});

	it("should keep every other field of the session", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const merged = mergeWalletIdentity(session, { name: "Cashonize" });

		expect(merged).not.toBe(session);
		expect(merged.id).toBe(session.id);
		expect(merged.protocol).toBe(session.protocol);
		expect(merged.data).toBe(session.data);
		expect(merged.status).toBe(session.status);
	});

	it("should never mutate the session it merges into", () => {
		const session = demoSession({
			wallet: { icon: "https://example.com/paytaca.svg", source: "protocol" },
		});
		const wallet = session.wallet;
		const before = structuredClone(session);

		mergeWalletIdentity(session, { id: "paytaca", name: "Paytaca" });

		expect(session).toStrictEqual(before);
		expect(session.wallet).toBe(wallet);
	});
});

describe("keepWalletIdentity", () => {
	it("should fill the fields the newer snapshot left out", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const kept = keepWalletIdentity(session, {
			id: "cashonize",
			name: "Cashonize",
			source: "selection",
		});

		expect(kept.wallet).toStrictEqual({
			id: "cashonize",
			name: "Cashonize",
			source: "selection",
		});
	});

	it("should let the newer snapshot's name win and mark it as the protocol's", () => {
		const session = demoSession({
			wallet: { name: "Paytaca", source: "protocol" },
		});

		const kept = keepWalletIdentity(session, {
			id: "cashonize",
			name: "Cashonize",
			source: "selection",
		});

		expect(kept.wallet).toStrictEqual({
			id: "cashonize",
			name: "Paytaca",
			source: "protocol",
		});
	});

	it("should keep the earlier source of a name the newer snapshot left out", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const kept = keepWalletIdentity(session, {
			name: "Paytaca",
			source: "protocol",
		});

		expect(kept.wallet).toStrictEqual({ name: "Paytaca", source: "protocol" });
	});

	it("should return the same session when nothing is filled", () => {
		const session = demoSession({
			wallet: { name: "Paytaca", source: "protocol" },
		});

		expect(keepWalletIdentity(session, { source: "selection" })).toBe(session);
	});
});

describe("connector events", () => {
	const appMetadata = { name: "Test", url: "https://example.com" };

	function createLogger(): Logger {
		return {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		};
	}

	async function setup(
		restored: readonly Session<DemoProtocol>[],
		extra: readonly Connector[] = [],
	) {
		const connector = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			restore: restored,
		});
		const logger = createLogger();
		const client = createClient({
			connectors: [connector, ...extra],
			network: "chipnet",
			appMetadata,
			logger,
		});
		const events: [string, unknown][] = [];
		for (const event of [
			"session:connected",
			"session:changed",
			"session:disconnected",
		] as const) {
			client.on(event, (payload) => events.push([event, payload]));
		}
		await client.init();

		return { client, connector, logger, events };
	}

	describe("session:changed", () => {
		it("should replace the session and announce it with the one it replaced", async () => {
			const first = demoSession({ id: "first" });
			const { client, connector, events } = await setup([first]);
			const changed = demoSession({
				id: "first",
				status: { transport: "reconnecting", peer: "unknown" },
			});

			connector.emit("session:changed", { session: changed, previous: first });

			expect(client.sessions.get("first")).toBe(changed);
			expect(events).toEqual([
				["session:changed", { session: changed, previous: first }],
			]);
		});

		it("should never mutate the session it replaces", async () => {
			const first = demoSession({ id: "first" });
			const status = first.status;
			const { connector } = await setup([first]);

			connector.emit("session:changed", {
				session: demoSession({
					id: "first",
					status: { transport: "disconnected", peer: "unknown" },
				}),
				previous: first,
			});

			expect(first.status).toBe(status);
			expect(first.status).toStrictEqual({
				transport: "connected",
				peer: "reachable",
			});
		});

		it("should keep the wallet identity the change leaves out", async () => {
			const first = demoSession({
				id: "first",
				wallet: { id: "cashonize", name: "Cashonize", source: "selection" },
			});
			const { client, connector } = await setup([first]);

			connector.emit("session:changed", {
				session: demoSession({ id: "first", wallet: { source: "protocol" } }),
				previous: first,
			});

			expect(client.sessions.get("first")?.wallet).toStrictEqual(first.wallet);
		});

		it("should keep the session current", async () => {
			const first = demoSession({ id: "first" });
			const { client, connector } = await setup([first]);

			connector.emit("session:changed", {
				session: demoSession({ id: "first" }),
				previous: first,
			});

			expect(client.store.getState().currentSessionId).toBe("first");
		});

		it("should ignore a session that is not in state", async () => {
			const { client, connector, events } = await setup([]);
			const state = client.store.getState();
			const unknown = demoSession({ id: "unknown" });

			connector.emit("session:changed", {
				session: unknown,
				previous: unknown,
			});

			expect(client.store.getState()).toBe(state);
			expect(events).toEqual([]);
		});

		it("should ignore the session already in state", async () => {
			const first = demoSession({ id: "first" });
			const { client, connector, events } = await setup([first]);
			const state = client.store.getState();

			connector.emit("session:changed", { session: first, previous: first });

			expect(client.store.getState()).toBe(state);
			expect(events).toEqual([]);
		});
	});

	describe("session:disconnected", () => {
		it("should remove the session and announce it with the connector's reason", async () => {
			const { client, connector, events } = await setup([
				demoSession({ id: "first" }),
			]);

			connector.emit("session:disconnected", {
				sessionId: "first",
				reason: "wallet",
			});

			expect(client.sessions.size).toBe(0);
			expect(events).toEqual([
				["session:disconnected", { sessionId: "first", reason: "wallet" }],
			]);
		});

		it("should leave no session current when the current one goes", async () => {
			const first = demoSession({ id: "first" });
			const second = demoSession({ id: "second" });
			const { client, connector } = await setup([first, second]);

			connector.emit("session:disconnected", {
				sessionId: "first",
				reason: "wallet",
			});

			expect(client.store.getState().currentSessionId).toBeNull();
			expect(client.sessions.get("second")).toBe(second);
		});

		it("should keep the current session when another one goes", async () => {
			const first = demoSession({ id: "first" });
			const { client, connector } = await setup([
				first,
				demoSession({ id: "second" }),
			]);

			connector.emit("session:disconnected", {
				sessionId: "second",
				reason: "expired",
			});

			expect(client.store.getState().currentSessionId).toBe("first");
			expect(client.sessions.get("first")).toBe(first);
		});

		it("should ignore a session that is not in state", async () => {
			const { client, connector, events } = await setup([]);
			const state = client.store.getState();

			connector.emit("session:disconnected", {
				sessionId: "unknown",
				reason: "wallet",
			});

			expect(client.store.getState()).toBe(state);
			expect(events).toEqual([]);
		});
	});

	it("should ignore session:connected with a warning while no connect() is pending", async () => {
		const { client, connector, logger, events } = await setup([]);
		const state = client.store.getState();

		connector.emit("session:connected", { session: demoSession() });

		expect(client.store.getState()).toBe(state);
		expect(events).toEqual([]);
		expect(logger.warn).toHaveBeenCalledWith(
			'Ignoring session:connected from "demo": no connect() is pending',
		);
	});

	it("should ignore, with a warning, events about another protocol's session", async () => {
		const alt = createFakeConnector<DemoAltProtocol>({ protocol: "demo-alt" });
		const first = demoSession({ id: "first" });
		const { client, logger, events } = await setup([first], [alt]);
		const state = client.store.getState();

		alt.emit("session:changed", {
			session: demoAltSession({ id: "first" }),
			previous: demoAltSession({ id: "first" }),
		});
		alt.emit("session:disconnected", { sessionId: "first", reason: "wallet" });

		expect(client.store.getState()).toBe(state);
		expect(events).toEqual([]);
		expect(logger.warn).toHaveBeenCalledWith(
			'Ignoring session:changed from "demo-alt" for a "demo" session',
		);
		expect(logger.warn).toHaveBeenCalledWith(
			'Ignoring session:disconnected from "demo-alt" for a "demo" session',
		);
	});

	it("should ignore, with a warning, events from a connector whose setup failed", async () => {
		let context: ConnectorContext | undefined;
		const broken: Connector = {
			...createFakeConnector<DemoAltProtocol>({ protocol: "demo-alt" }),
			setup(ctx) {
				context = ctx;
				throw new Error("No relay");
			},
		};
		const { client, logger } = await setup(
			[demoSession({ id: "first" })],
			[broken],
		);
		const state = client.store.getState();

		context?.emit("session:disconnected", {
			sessionId: "first",
			reason: "wallet",
		});

		expect(client.store.getState()).toBe(state);
		expect(logger.warn).toHaveBeenCalledWith(
			'Ignoring session:disconnected from "demo-alt": its setup failed',
		);
	});

	it("should ignore every event once the client is disposed", async () => {
		const { client, connector, logger } = await setup([
			demoSession({ id: "first" }),
		]);
		await client.dispose();
		const state = client.store.getState();

		connector.emit("session:disconnected", {
			sessionId: "first",
			reason: "wallet",
		});

		expect(client.store.getState()).toBe(state);
		expect(logger.warn).not.toHaveBeenCalled();
	});
});

describe("connect", () => {
	const appMetadata = { name: "Test", url: "https://example.com" };

	function gate<T>() {
		let open: (value: T) => void = () => {};
		const promise = new Promise<T>((resolve) => {
			open = resolve;
		});
		return { promise, open };
	}

	function setup<const Connectors extends readonly Connector[]>(
		connectors: Connectors,
		config: { connectTimeoutMs?: number } = {},
	) {
		const client = createClient({
			connectors,
			network: "chipnet",
			appMetadata,
			...(config.connectTimeoutMs !== undefined && {
				defaultTimeoutMs: { connect: config.connectTimeoutMs },
			}),
		});
		const events: [string, unknown][] = [];
		for (const event of [
			"session:connected",
			"session:changed",
			"session:disconnected",
			"client:error",
		] as const) {
			client.on(event, (payload) => events.push([event, payload]));
		}
		return { client, events };
	}

	function demo(session = demoSession({ id: "first" })) {
		return createFakeConnector<DemoProtocol>({ protocol: "demo", session });
	}

	function configError(message: string) {
		return expect.objectContaining({ code: "CONFIG", message });
	}

	it("should add the session, make it current and announce it", async () => {
		const session = demoSession({ id: "first" });
		const { client, events } = setup([demo(session)]);
		await client.init();

		const connected = await client.connect("demo");

		expect(connected).toBe(session);
		expect(client.current).toBe(session);
		expect(events).toEqual([["session:connected", { session }]]);
	});

	it("should fill the wallet identity from the user's pick", async () => {
		const { client } = setup([
			demo(demoSession({ id: "first", wallet: { source: "protocol" } })),
		]);
		await client.init();

		const connected = await client.connect("demo", {
			wallet: { id: "cashonize", name: "Cashonize" },
		});

		expect(connected.wallet).toStrictEqual({
			id: "cashonize",
			name: "Cashonize",
			source: "selection",
		});
		expect(client.current).toBe(connected);
	});

	it("should hand the connector the pairing callback", async () => {
		const pairing = { kind: "uri", uri: "wc:pairing" } as const;
		const connector = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			session: demoSession(),
			pairing,
		});
		const { client } = setup([connector]);
		await client.init();
		const onPairing = vi.fn();

		await client.connect("demo", { onPairing });

		expect(onPairing).toHaveBeenCalledWith(pairing);
	});

	describe("modes", () => {
		it("should replace the current session by default, in one transition", async () => {
			const first = demoSession({ id: "first" });
			const second = demoSession({ id: "second" });
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [first],
				session: second,
			});
			const { client, events } = setup([connector]);
			await client.init();
			const transitions: string[][] = [];
			client.store.subscribe(() => {
				transitions.push([...client.store.getState().sessions.keys()]);
			});

			await client.connect("demo");
			await Promise.resolve();

			expect(transitions).toEqual([["second"]]);
			expect(client.current).toBe(second);
			expect(events).toEqual([
				["session:connected", { session: second }],
				["session:disconnected", { sessionId: "first", reason: "user" }],
			]);
			expect(connector.log).toContainEqual({
				kind: "disconnect",
				sessionId: "first",
			});
		});

		it("should keep the current session in add mode", async () => {
			const first = demoSession({ id: "first" });
			const second = demoSession({ id: "second" });
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [first],
				session: second,
			});
			const { client } = setup([connector]);
			await client.init();

			await client.connect("demo", { mode: "add" });

			expect([...client.sessions.keys()]).toEqual(["first", "second"]);
			expect(client.current).toBe(second);
			expect(connector.log).not.toContainEqual({
				kind: "disconnect",
				sessionId: "first",
			});
		});

		it("should report a replaced session its connector fails to disconnect", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [demoSession({ id: "first" })],
				session: demoSession({ id: "second" }),
				disconnect: "throw",
			});
			const { client, events } = setup([connector]);
			await client.init();

			await client.connect("demo");
			await settle();

			expect(events).toContainEqual([
				"client:error",
				{
					error: expect.objectContaining({
						code: "TRANSPORT",
						message: 'disconnect() failed for connector "demo"',
					}),
				},
			]);
		});

		it("should report a replaced session whose connector throws synchronously", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [demoSession({ id: "first" })],
				session: demoSession({ id: "second" }),
			});
			const failure = new Error("Not async");
			const { client, events } = setup([
				{
					...connector,
					disconnect() {
						throw failure;
					},
				},
			]);
			await client.init();

			await expect(client.connect("demo")).resolves.toMatchObject({
				id: "second",
			});
			await settle();

			expect(events).toContainEqual([
				"client:error",
				{
					error: expect.objectContaining({ code: "TRANSPORT", cause: failure }),
				},
			]);
		});

		it("should keep the current session when the new one fails", async () => {
			const first = demoSession({ id: "first" });
			const { client } = setup([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: [first],
					connect: "reject",
				}),
			]);
			await client.init();
			const state = client.store.getState();

			await expect(client.connect("demo")).rejects.toThrow(
				expect.objectContaining({ code: "REJECTED" }),
			);
			expect(client.store.getState()).toBe(state);
		});
	});

	describe("rejections", () => {
		it("should reject CONFIG when init() was never called", async () => {
			const { client } = setup([demo()]);

			await expect(client.connect("demo")).rejects.toThrow(
				configError("connect() was called before init()"),
			);
		});

		it("should reject CONFIG for an unregistered protocol", async () => {
			const { client } = setup([demo()]);
			await client.init();

			await expect(
				// @ts-expect-error - "nope" is not a registered protocol.
				client.connect("nope"),
			).rejects.toThrow(configError("Unknown protocol: nope"));
		});

		it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
			"should reject CONFIG for a timeoutMs of %s",
			async (timeoutMs) => {
				const { client } = setup([demo()]);
				await client.init();

				await expect(client.connect("demo", { timeoutMs })).rejects.toThrow(
					configError(`Invalid timeoutMs: ${timeoutMs}`),
				);
			},
		);

		it("should reject a second call for the same protocol and leave the first alone", async () => {
			const session = gate<Session<DemoProtocol>>();
			const { client } = setup([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					connect: () => session.promise,
				}),
			]);
			await client.init();
			const first = client.connect("demo");

			await expect(client.connect("demo")).rejects.toThrow(
				configError('connect() is already pending for "demo"'),
			);
			const connected = demoSession({ id: "first" });
			session.open(connected);
			await expect(first).resolves.toBe(connected);
		});

		it("should accept a new call once the previous one has settled", async () => {
			const { client } = setup([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					session: () => demoSession(),
				}),
			]);
			await client.init();

			await client.connect("demo");
			await client.connect("demo", { mode: "add" });

			expect(client.sessions.size).toBe(2);
		});

		it("should connect two protocols at once", async () => {
			const { client } = setup([
				demo(),
				createFakeConnector<DemoAltProtocol>({
					protocol: "demo-alt",
					session: demoAltSession({ id: "alt" }),
				}),
			]);
			await client.init();

			const [first, alt] = await Promise.all([
				client.connect("demo"),
				client.connect("demo-alt", { mode: "add" }),
			]);

			expect([...client.sessions.values()]).toEqual([first, alt]);
		});

		it("should reject CONFIG with the setup failure for a disabled connector", async () => {
			const { client } = setup([
				createFakeConnector<DemoProtocol>({ protocol: "demo", setup: "throw" }),
			]);
			await client.init();

			await expect(client.connect("demo")).rejects.toThrow(
				expect.objectContaining({
					code: "CONFIG",
					message: 'Connector "demo" failed setup',
					cause: expect.objectContaining({
						message: 'Fake connector "demo" failed setup.',
					}),
				}),
			);
		});

		it("should wrap a connector that throws synchronously", async () => {
			const failure = new Error("Not async");
			const { client } = setup([
				{
					...demo(),
					connect() {
						throw failure;
					},
				},
			]);
			await client.init();

			await expect(client.connect("demo")).rejects.toThrow(
				expect.objectContaining({ code: "TRANSPORT", cause: failure }),
			);
		});

		it("should wrap a connector failure that is not a library error", async () => {
			const failure = new Error("Relay closed");
			const { client } = setup([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					connect: () => Promise.reject(failure),
				}),
			]);
			await client.init();

			await expect(client.connect("demo")).rejects.toThrow(
				expect.objectContaining({
					code: "TRANSPORT",
					message: 'connect() failed for connector "demo"',
					cause: failure,
				}),
			);
		});
	});

	describe("before init resolves", () => {
		it("should ignore a session:connected emitted before the call reaches the connector", async () => {
			const setupDone = gate<void>();
			let context: ConnectorContext | undefined;
			const connector = demo(demoSession({ id: "requested" }));
			const logger = {
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};
			const client = createClient({
				connectors: [
					{
						...connector,
						setup(ctx: ConnectorContext) {
							context = ctx;
							return setupDone.promise;
						},
					},
				],
				network: "chipnet",
				appMetadata,
				logger,
			});
			void client.init();
			const connecting = client.connect("demo");

			context?.emit("session:connected", {
				session: demoSession({ id: "unrequested" }),
			});
			setupDone.open();

			await expect(connecting).resolves.toMatchObject({ id: "requested" });
			expect([...client.sessions.keys()]).toEqual(["requested"]);
			expect(logger.warn).toHaveBeenCalledWith(
				'Ignoring session:connected from "demo": no connect() is pending',
			);
		});

		it("should accept a call made by a store subscriber as init() starts", async () => {
			const { client } = setup([demo()]);
			const calls: Promise<unknown>[] = [];
			const unsubscribe = client.store.subscribe(() => {
				if (client.status === "restoring") {
					unsubscribe();
					calls.push(client.connect("demo"));
				}
			});

			await client.init();

			await expect(calls[0]).resolves.toMatchObject({ id: "first" });
		});

		it("should never reach the connector when the caller aborts during the wait", async () => {
			const setupDone = gate<void>();
			const connector = demo();
			const { client } = setup([
				{ ...connector, setup: () => setupDone.promise },
			]);
			void client.init();
			const controller = new AbortController();
			const connecting = client.connect("demo", { signal: controller.signal });

			controller.abort("closed the modal");
			await expect(connecting).rejects.toThrow(
				expect.objectContaining({ code: "ABORTED" }),
			);
			setupDone.open();
			await settle();

			expect(connector.log).not.toContainEqual(
				expect.objectContaining({ kind: "connect" }),
			);
		});

		it("should wait for an init() that has started", async () => {
			const setupDone = gate<void>();
			const connector = demo();
			const { client } = setup([
				{ ...connector, setup: () => setupDone.promise },
			]);
			void client.init();
			const connecting = client.connect("demo");
			await settle();

			expect(connector.log).toEqual([]);
			setupDone.open();
			await connecting;
			expect(connector.log).toContainEqual({
				kind: "connect",
				timeoutMs: undefined,
			});
		});
	});

	describe("deadlines and aborts", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		function hanging() {
			return createFakeConnector<DemoProtocol>({
				protocol: "demo",
				connect: "hang",
			});
		}

		it("should reject TIMEOUT once timeoutMs has passed", async () => {
			const { client } = setup([hanging()]);
			await client.init();

			const connecting = client.connect("demo", { timeoutMs: 1_000 });
			const settled = expect(connecting).rejects.toThrow(
				expect.objectContaining({
					code: "TIMEOUT",
					message: 'connect() timed out for "demo"',
				}),
			);
			await vi.advanceTimersByTimeAsync(1_000);

			await settled;
		});

		it("should fall back to the configured connect deadline", async () => {
			const connector = hanging();
			const { client } = setup([connector], { connectTimeoutMs: 2_000 });
			await client.init();

			const connecting = client.connect("demo");
			const settled = expect(connecting).rejects.toThrow(
				expect.objectContaining({ code: "TIMEOUT" }),
			);
			await vi.advanceTimersByTimeAsync(2_000);

			await settled;
			expect(connector.log).toContainEqual({
				kind: "connect",
				timeoutMs: 2_000,
			});
		});

		it("should count the deadline from the call, waiting for init included", async () => {
			const setupDone = gate<void>();
			const connector = hanging();
			const { client } = setup([
				{ ...connector, setup: () => setupDone.promise },
			]);
			void client.init();

			const connecting = client.connect("demo", { timeoutMs: 1_000 });
			const settled = expect(connecting).rejects.toThrow(
				expect.objectContaining({ code: "TIMEOUT" }),
			);
			await vi.advanceTimersByTimeAsync(400);
			setupDone.open();
			await vi.advanceTimersByTimeAsync(0);

			expect(connector.log).toContainEqual({ kind: "connect", timeoutMs: 600 });
			await vi.advanceTimersByTimeAsync(600);
			await settled;
		});

		it("should disconnect, not adopt, a session that arrives after the deadline", async () => {
			const late = gate<Session<DemoProtocol>>();
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				connect: () => late.promise,
			});
			const { client, events } = setup([connector]);
			await client.init();
			const connecting = client.connect("demo", { timeoutMs: 1_000 });
			const settled = expect(connecting).rejects.toThrow(
				expect.objectContaining({ code: "TIMEOUT" }),
			);
			await vi.advanceTimersByTimeAsync(1_000);
			await settled;

			late.open(demoSession({ id: "late" }));
			await vi.advanceTimersByTimeAsync(0);

			expect(client.sessions.size).toBe(0);
			expect(events).toEqual([]);
			expect(connector.log).toContainEqual({
				kind: "disconnect",
				sessionId: "late",
			});
		});

		it("should not disconnect a late session that is already in state", async () => {
			const late = gate<Session<DemoProtocol>>();
			const first = demoSession({ id: "first" });
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [first],
				connect: () => late.promise,
			});
			const { client } = setup([connector]);
			await client.init();
			const connecting = client.connect("demo", { timeoutMs: 1_000 });
			const settled = expect(connecting).rejects.toThrow(
				expect.objectContaining({ code: "TIMEOUT" }),
			);
			await vi.advanceTimersByTimeAsync(1_000);
			await settled;

			late.open(demoSession({ id: "first" }));
			await vi.advanceTimersByTimeAsync(0);

			expect(client.sessions.get("first")).toBe(first);
			expect(connector.log).not.toContainEqual(
				expect.objectContaining({ kind: "disconnect" }),
			);
		});

		it.each<
			[string, (client: DemoClient, controller: AbortController) => unknown]
		>([
			["the caller aborts", (_client, controller) => controller.abort()],
			["the deadline passes", () => vi.advanceTimersByTimeAsync(1_000)],
			["the client is disposed", (client) => client.dispose()],
		])("should abort the connector's signal when %s", async (_cause, end) => {
			let received: AbortSignal | undefined;
			const { client } = setup([
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					connect: ({ signal }) => {
						received = signal;
						return new Promise(() => {});
					},
				}),
			]);
			await client.init();
			const controller = new AbortController();
			const connecting = client.connect("demo", {
				signal: controller.signal,
				timeoutMs: 1_000,
			});
			const settled = expect(connecting).rejects.toThrow();
			await vi.advanceTimersByTimeAsync(0);
			expect(received?.aborted).toBe(false);

			await end(client, controller);
			await settled;

			expect(received?.aborted).toBe(true);
		});

		it("should reject ABORTED when the caller aborts", async () => {
			const { client } = setup([hanging()]);
			await client.init();
			const controller = new AbortController();

			const connecting = client.connect("demo", { signal: controller.signal });
			controller.abort("closed the modal");

			await expect(connecting).rejects.toThrow(
				expect.objectContaining({ code: "ABORTED", cause: "closed the modal" }),
			);
		});

		it("should reject ABORTED when the client is disposed", async () => {
			const { client } = setup([hanging()]);
			await client.init();

			const connecting = client.connect("demo");
			await client.dispose();

			await expect(connecting).rejects.toThrow(
				expect.objectContaining({
					code: "ABORTED",
					message: "The client was disposed",
				}),
			);
		});
	});

	describe("a connector that emits the session itself", () => {
		it("should settle on the emitted session and announce it once", async () => {
			const session = demoSession({ id: "first" });
			const connector: FakeDemo = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				connect: async () => {
					connector.emit("session:connected", { session });
					return session;
				},
			});
			const { client, events } = setup([connector]);
			await client.init();

			await expect(client.connect("demo")).resolves.toBe(session);
			expect(events).toEqual([["session:connected", { session }]]);
		});

		it("should resolve with the emitted session even when the connector then fails", async () => {
			const session = demoSession({ id: "first" });
			const connector: FakeDemo = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				connect: async () => {
					connector.emit("session:connected", { session });
					throw new Error("Late failure");
				},
			});
			const { client } = setup([connector]);
			await client.init();

			await expect(client.connect("demo")).resolves.toBe(session);
			expect(client.current).toBe(session);
		});

		it("should disconnect, not adopt, a second session from the same call", async () => {
			const emitted = demoSession({ id: "emitted" });
			const connector: FakeDemo = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				connect: async () => {
					connector.emit("session:connected", { session: emitted });
					return demoSession({ id: "returned" });
				},
			});
			const { client, events } = setup([connector]);
			await client.init();

			await expect(client.connect("demo")).resolves.toBe(emitted);
			await settle();

			expect([...client.sessions.keys()]).toEqual(["emitted"]);
			expect(events).toEqual([["session:connected", { session: emitted }]]);
			expect(connector.log).toContainEqual({
				kind: "disconnect",
				sessionId: "returned",
			});
		});

		it("should make a session already in state current", async () => {
			const second = demoSession({ id: "second" });
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [demoSession({ id: "first" }), second],
				session: demoSession({ id: "second" }),
			});
			const { client, events } = setup([connector]);
			await client.init();

			await expect(client.connect("demo")).resolves.toBe(second);
			expect(client.current).toBe(second);
			expect(client.sessions.size).toBe(2);
			expect(events).toEqual([]);
		});

		it("should return a session already in state without announcing it", async () => {
			const first = demoSession({ id: "first" });
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [first],
				session: demoSession({ id: "first" }),
			});
			const { client, events } = setup([connector]);
			await client.init();

			await expect(client.connect("demo")).resolves.toBe(first);
			expect(events).toEqual([]);
		});
	});
});
