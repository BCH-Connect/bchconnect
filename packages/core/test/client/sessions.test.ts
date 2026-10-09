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
import { TransportError } from "../../src/errors.js";
import { parseSnapshot, SNAPSHOT_KEY } from "../../src/snapshot.js";
import { memory } from "../../src/storage/memory.js";
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
			// The newest restored session, "first", becomes current.
			const { client, connector } = await setup([second, first]);

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
				demoSession({ id: "second" }),
				first,
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
				restore: [second, demoSession({ id: "first" })],
				session: demoSession({ id: "second" }),
			});
			const { client, events } = setup([connector]);
			await client.init();
			expect(client.current?.id).toBe("first");

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

describe("disconnect", () => {
	const appMetadata = { name: "Test", url: "https://example.com" };

	function setup(connectors: readonly Connector[]) {
		const client = createClient({
			connectors,
			network: "chipnet",
			appMetadata,
		});
		const events: [string, unknown][] = [];
		for (const event of ["session:disconnected", "client:error"] as const) {
			client.on(event, (payload) => events.push([event, payload]));
		}
		return { client, events };
	}

	function demo(
		script: Partial<
			Parameters<typeof createFakeConnector<DemoProtocol>>[0]
		> = {},
	) {
		return createFakeConnector<DemoProtocol>({
			protocol: "demo",
			restore: [demoSession({ id: "first" })],
			session: demoSession({ id: "second" }),
			...script,
		});
	}

	it("should end the current session when none is given", async () => {
		const connector = demo();
		const { client, events } = setup([connector]);
		await client.init();
		await client.connect("demo", { mode: "add" });

		await client.disconnect();

		expect([...client.sessions.keys()]).toEqual(["first"]);
		expect(client.current).toBeNull();
		expect(events).toEqual([
			["session:disconnected", { sessionId: "second", reason: "user" }],
		]);
		expect(connector.log).toContainEqual({
			kind: "disconnect",
			sessionId: "second",
		});
	});

	it("should end the given session and keep the current one", async () => {
		const connector = demo();
		const { client } = setup([connector]);
		await client.init();
		await client.connect("demo", { mode: "add" });
		const first = client.sessions.get("first");

		await client.disconnect(first);

		expect([...client.sessions.keys()]).toEqual(["second"]);
		expect(client.current?.id).toBe("second");
	});

	it("should remove the session before the connector disconnects it", async () => {
		const connector = demo();
		const seen: string[][] = [];
		const { client } = setup([
			{
				...connector,
				disconnect(session: Session<DemoProtocol>) {
					seen.push([...client.sessions.keys()]);
					return connector.disconnect(session);
				},
			},
		]);
		await client.init();
		await client.connect("demo", { mode: "add" });

		await client.disconnect(client.sessions.get("first"));

		expect(seen).toEqual([["second"]]);
	});

	it("should hand the connector the session in state", async () => {
		const connector = demo();
		const handed: Session[] = [];
		const { client } = setup([
			{
				...connector,
				disconnect(session: Session<DemoProtocol>) {
					handed.push(session);
					return connector.disconnect(session);
				},
			},
		]);
		await client.init();
		const stored = client.sessions.get("first");

		await client.disconnect(demoSession({ id: "first" }));

		expect(handed).toHaveLength(1);
		expect(handed[0]).toBe(stored);
	});

	it.each([
		{ when: "there is no current session", script: { restore: [] } },
		{
			when: "the session is not in state",
			target: demoSession({ id: "gone" }),
		},
	])("should be a quiet no-op when $when", async ({ script, target }) => {
		const connector = demo(script);
		const { client, events } = setup([connector]);
		await client.init();
		const state = client.store.getState();

		await client.disconnect(target);

		expect(client.store.getState()).toBe(state);
		expect(events).toEqual([]);
		expect(connector.log).not.toContainEqual(
			expect.objectContaining({ kind: "disconnect" }),
		);
	});

	it("should announce the session once when its connector reports it too", async () => {
		const connector = demo();
		let context: ConnectorContext | undefined;
		const { client, events } = setup([
			{
				...connector,
				setup(ctx: ConnectorContext) {
					context = ctx;
					return connector.setup?.(ctx);
				},
				async disconnect(session: Session<DemoProtocol>) {
					context?.emit("session:disconnected", {
						sessionId: session.id,
						reason: "wallet",
					});
					await connector.disconnect(session);
				},
			},
		]);
		await client.init();

		await client.disconnect();

		expect(events).toEqual([
			["session:disconnected", { sessionId: "first", reason: "user" }],
		]);
	});

	it("should end a session once when called twice", async () => {
		const connector = demo();
		const { client, events } = setup([connector]);
		await client.init();
		const first = client.sessions.get("first");

		await Promise.all([client.disconnect(first), client.disconnect(first)]);

		expect(events).toHaveLength(1);
		expect(
			connector.log.filter((entry) => entry.kind === "disconnect"),
		).toHaveLength(1);
	});

	it("should resolve and report a connector that fails", async () => {
		const { client, events } = setup([demo({ disconnect: "throw" })]);
		await client.init();

		await expect(
			client.disconnect(client.sessions.get("first")),
		).resolves.toBeUndefined();

		expect(client.sessions.has("first")).toBe(false);
		expect(events).toEqual([
			["session:disconnected", { sessionId: "first", reason: "user" }],
			[
				"client:error",
				{
					error: expect.objectContaining({
						code: "TRANSPORT",
						message: 'disconnect() failed for connector "demo"',
					}),
				},
			],
		]);
	});

	it("should report a connector that throws synchronously", async () => {
		const failure = new Error("Not async");
		const { client, events } = setup([
			{
				...demo(),
				disconnect() {
					throw failure;
				},
			},
		]);
		await client.init();

		await expect(
			client.disconnect(client.sessions.get("first")),
		).resolves.toBeUndefined();

		expect(events).toContainEqual([
			"client:error",
			{ error: expect.objectContaining({ code: "TRANSPORT", cause: failure }) },
		]);
	});

	it("should pass a library error from the connector through unchanged", async () => {
		const failure = new TransportError("Relay closed");
		const { client, events } = setup([
			{ ...demo(), disconnect: () => Promise.reject(failure) },
		]);
		await client.init();

		await client.disconnect(client.sessions.get("first"));

		expect(events).toContainEqual(["client:error", { error: failure }]);
	});

	describe("before init resolves", () => {
		it("should reject CONFIG when init() was never called", async () => {
			const { client } = setup([demo()]);

			await expect(client.disconnect()).rejects.toThrow(
				expect.objectContaining({
					code: "CONFIG",
					message: "disconnect() was called before init()",
				}),
			);
		});

		it("should wait for a started init() and then end the restored session", async () => {
			const connector = demo({ restore: [demoSession({ id: "first" })] });
			const { client } = setup([connector]);
			void client.init();

			await client.disconnect(demoSession({ id: "first" }));

			expect(client.sessions.size).toBe(0);
			expect(connector.log).toContainEqual({
				kind: "disconnect",
				sessionId: "first",
			});
		});

		it("should reject ABORTED when the client is disposed during the wait", async () => {
			const connector = demo();
			const { client } = setup([
				{ ...connector, setup: () => new Promise<void>(() => {}) },
			]);
			void client.init();
			const disconnecting = client.disconnect();

			await client.dispose();

			await expect(disconnecting).rejects.toThrow(
				expect.objectContaining({ code: "ABORTED" }),
			);
		});

		it("should keep the session when the client is disposed as the wait ends", async () => {
			const connector = demo();
			const { client, events } = setup([connector]);
			const initializing = client.init();
			const disconnecting = client.disconnect();
			// Runs right after init() resolves, before disconnect() resumes.
			void initializing.then(() => client.dispose());

			await expect(disconnecting).rejects.toThrow(
				expect.objectContaining({ code: "ABORTED" }),
			);
			expect(client.sessions.has("first")).toBe(true);
			expect(events).toEqual([]);
			expect(connector.log).not.toContainEqual(
				expect.objectContaining({ kind: "disconnect" }),
			);
		});
	});
});

describe("setCurrent", () => {
	const appMetadata = { name: "Test", url: "https://example.com" };

	async function setup(storage = memory()) {
		const client = createClient({
			connectors: [
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					// The newest restored session, "first", becomes current.
					restore: [
						demoSession({ id: "second" }),
						demoSession({ id: "first" }),
					],
				}),
			],
			network: "chipnet",
			appMetadata,
			storage,
		});
		await client.init();
		const events: unknown[] = [];
		for (const event of [
			"session:connected",
			"session:changed",
			"session:disconnected",
		] as const) {
			client.on(event, (payload) => events.push(payload));
		}
		return { client, events };
	}

	it("should make the given session current, with no event", async () => {
		const { client, events } = await setup();
		const sessions = client.sessions;
		expect(client.current?.id).toBe("first");

		client.setCurrent(client.sessions.get("second") ?? null);

		expect(client.current?.id).toBe("second");
		expect(client.sessions).toBe(sessions);
		expect(events).toEqual([]);
	});

	it("should resolve the session by id, not by reference", async () => {
		const { client } = await setup();
		const stored = client.sessions.get("second");

		client.setCurrent(demoSession({ id: "second" }));

		expect(client.current).toBe(stored);
	});

	it("should clear the current session when given null", async () => {
		const { client } = await setup();

		client.setCurrent(null);

		expect(client.current).toBeNull();
		expect(client.sessions.size).toBe(2);
	});

	it("should throw SESSION_MISSING for a session that is not in state", async () => {
		const { client } = await setup();
		const state = client.store.getState();

		expect(() => client.setCurrent(demoSession({ id: "gone" }))).toThrow(
			expect.objectContaining({ code: "SESSION_MISSING", sessionId: "gone" }),
		);
		expect(client.store.getState()).toBe(state);
	});

	it("should not notify the store when the session is already current", async () => {
		const { client } = await setup();
		expect(client.current?.id).toBe("first");
		const listener = vi.fn();
		client.store.subscribe(listener);

		client.setCurrent(client.current);

		expect(listener).not.toHaveBeenCalled();
	});

	it("should not notify the store when clearing with nothing current", async () => {
		const { client } = await setup();
		client.setCurrent(null);
		const listener = vi.fn();
		client.store.subscribe(listener);

		client.setCurrent(null);

		expect(listener).not.toHaveBeenCalled();
	});

	it("should persist the new current session", async () => {
		const storage = memory();
		const { client } = await setup(storage);

		client.setCurrent(client.sessions.get("second") ?? null);
		// dispose() waits for queued snapshot writes.
		await client.dispose();

		const saved = parseSnapshot(await storage.get(SNAPSHOT_KEY), console);
		expect(saved?.currentSessionId).toBe("second");
	});

	it("should answer synchronously before init(), against an empty state", () => {
		const client = createClient({
			connectors: [
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					restore: [demoSession({ id: "first" })],
				}),
			],
			network: "chipnet",
			appMetadata,
		});

		expect(() => client.setCurrent(null)).not.toThrow();
		expect(() => client.setCurrent(demoSession({ id: "first" }))).toThrow(
			expect.objectContaining({ code: "SESSION_MISSING" }),
		);
	});
});

describe("session", () => {
	const appMetadata = { name: "Test", url: "https://example.com" };

	// Restores "first" and "second" over demo, then connects "alt" over
	// demo-alt in add mode, so "alt" is current.
	async function setup() {
		const demo = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			restore: [demoSession({ id: "first" }), demoSession({ id: "second" })],
		});
		const alt = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
			session: demoAltSession({ id: "alt" }),
		});
		const client = createClient({
			connectors: [demo, alt],
			network: "chipnet",
			appMetadata,
		});
		await client.init();
		await client.connect("demo-alt", { mode: "add" });
		return { client, demo };
	}

	it("should return the current session when it belongs to the protocol", async () => {
		const { client } = await setup();

		expect(client.session("demo-alt")).toBe(client.current);
	});

	it("should return the current session over a newer one of the same protocol", async () => {
		const { client } = await setup();
		client.setCurrent(client.sessions.get("first") ?? null);

		expect(client.session("demo")?.id).toBe("first");
	});

	it("should fall back to the most recently connected session of the protocol", async () => {
		const { client } = await setup();

		expect(client.session("demo")?.id).toBe("second");
	});

	it("should keep connection order when an older session changes", async () => {
		const { client, demo } = await setup();
		const first = client.sessions.get("first");
		if (first === undefined) throw new Error("first was not restored");

		demo.emit("session:changed", {
			session: demoSession({
				id: "first",
				status: { transport: "reconnecting", peer: "unknown" },
			}),
			previous: first,
		});

		expect(client.session("demo")?.id).toBe("second");
	});

	it("should return null when the protocol has no session", async () => {
		const { client } = await setup();
		await client.disconnect(client.sessions.get("alt"));

		expect(client.session("demo-alt")).toBeNull();
	});

	it("should return null for an unregistered protocol", async () => {
		const { client } = await setup();

		// @ts-expect-error - "nope" is not a registered protocol.
		expect(client.session("nope")).toBeNull();
	});

	it("should return null for a connector whose setup failed", async () => {
		const client = createClient({
			connectors: [
				createFakeConnector<DemoProtocol>({
					protocol: "demo",
					setup: "throw",
					restore: [demoSession({ id: "first" })],
				}),
			],
			network: "chipnet",
			appMetadata,
		});
		await client.init();

		expect(client.session("demo")).toBeNull();
	});

	it("should keep answering after dispose()", async () => {
		const { client } = await setup();
		await client.dispose();

		expect(client.session("demo-alt")?.id).toBe("alt");
		expect(client.session("demo")?.id).toBe("second");
	});
});
