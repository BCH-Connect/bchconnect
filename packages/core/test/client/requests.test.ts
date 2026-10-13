import type { DemoProtocol } from "@bchconnect/test-utils";
import {
	createFakeConnector,
	demoMetadata,
	demoSession,
} from "@bchconnect/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import {
	AbortedError,
	type BchConnectError,
	ConfigError,
	InvalidWalletResponseError,
	MethodUnsupportedError,
	RequestRejectedError,
	SessionMissingError,
	TimeoutError,
	TransportError,
} from "../../src/errors.js";
import type { LifecycleEvents } from "../../src/types/client.js";
import type { Session } from "../../src/types/protocol.js";

type RequestEvent =
	| ["request:pending", LifecycleEvents["request:pending"]]
	| ["request:settled", LifecycleEvents["request:settled"]];

const appMetadata = { name: "Test", url: "https://example.com" };
const uuid =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Lets background work run.
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

async function setup(
	methods: NonNullable<
		Parameters<typeof createFakeConnector<DemoProtocol>>[0]["methods"]
	> = {},
	options: {
		metadata?: false;
		restore?: readonly Session<DemoProtocol>[];
	} = {},
) {
	const session = demoSession({ id: "s1" });
	const connector = createFakeConnector<DemoProtocol>({
		protocol: "demo",
		restore: options.restore ?? [session],
		methods,
		...(options.metadata === false ? {} : { metadata: demoMetadata }),
	});
	const client = createClient({
		connectors: [connector],
		network: "chipnet",
		appMetadata,
	});
	const events: RequestEvent[] = [];
	client.on("request:pending", (payload) =>
		events.push(["request:pending", payload]),
	);
	client.on("request:settled", (payload) =>
		events.push(["request:settled", payload]),
	);
	await client.init();

	return { client, connector, session, events };
}

async function rejection(promise: Promise<unknown>): Promise<BchConnectError> {
	try {
		await promise;
	} catch (error) {
		return error as BchConnectError;
	}
	throw new Error("Expected a rejection");
}

describe("request", () => {
	describe("session check", () => {
		it("should reject SESSION_MISSING for a session that is not connected", async () => {
			const { client, connector, events } = await setup({}, { restore: [] });
			const stranger = demoSession({ id: "stranger" });

			const error = await rejection(
				client.request(stranger, "get_addresses", undefined),
			);

			expect(error).toBeInstanceOf(SessionMissingError);
			expect(error.sessionId).toBe("stranger");
			expect(connector.calls).toEqual([]);
			expect(events).toEqual([]);
			expect(client.store.getState().pendingRequests.size).toBe(0);
		});

		it("should reject SESSION_MISSING before init()", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [demoSession({ id: "s1" })],
			});
			const client = createClient({
				connectors: [connector],
				network: "chipnet",
				appMetadata,
			});

			await expect(
				client.request(demoSession({ id: "s1" }), "get_addresses", undefined),
			).rejects.toBeInstanceOf(SessionMissingError);
		});

		it("should dispatch on the session in state when the caller holds an older snapshot", async () => {
			const { client, connector, session } = await setup({
				get_addresses: async () => ({ addresses: [] }),
			});
			const changed = demoSession({
				id: "s1",
				status: { transport: "reconnecting", peer: "unknown" },
			});
			connector.emit("session:changed", {
				session: changed,
				previous: session,
			});
			const dispatch = vi.spyOn(connector, "request");

			await client.request(session, "get_addresses", undefined);

			expect(client.sessions.get("s1")).toBe(changed);
			expect(dispatch.mock.calls[0]?.[0]).toBe(changed);
		});
	});

	describe("dispatch", () => {
		it("should resolve with the connector's result", async () => {
			const { client, session } = await setup({
				get_balance: async ({ address }) => ({ sats: BigInt(address.length) }),
			});

			await expect(
				client.request(session, "get_balance", { address: "bitcoincash:q" }),
			).resolves.toEqual({ sats: 13n });
		});

		it("should pass the params, a generated id and one signal to the connector", async () => {
			const { client, connector, session } = await setup({
				get_balance: async () => ({ sats: 0n }),
			});

			await client.request(session, "get_balance", { address: "a" });

			const call = connector.calls[0];
			expect(call?.params).toEqual({ address: "a" });
			expect(call?.opts?.id).toMatch(uuid);
			expect(call?.signal).toBeInstanceOf(AbortSignal);
			expect(call?.opts).toEqual({
				signal: call?.signal,
				id: call?.opts?.id,
				timeoutMs: 5_000,
			});
		});

		it("should pass a caller-supplied id through unchanged", async () => {
			const { client, connector, session, events } = await setup({
				get_balance: async () => ({ sats: 0n }),
			});

			await client.request(
				session,
				"get_balance",
				{ address: "a" },
				{ id: "req-7" },
			);

			expect(connector.calls[0]?.opts?.id).toBe("req-7");
			expect(events.map(([, payload]) => payload.id)).toEqual([
				"req-7",
				"req-7",
			]);
		});

		it("should generate a different id per request", async () => {
			const { client, connector, session } = await setup({
				get_balance: async () => ({ sats: 0n }),
			});

			await client.request(session, "get_balance", { address: "a" });
			await client.request(session, "get_balance", { address: "a" });

			expect(connector.calls[0]?.opts?.id).not.toBe(
				connector.calls[1]?.opts?.id,
			);
		});
	});

	describe("pending state and events", () => {
		it("should track the request and announce it before dispatch", async () => {
			let seen: unknown;
			let seenEvents = 0;
			const { client, session, events } = await setup({
				sign_message: async () => {
					seen = client.store.getState().pendingRequests;
					seenEvents = events.length;
					return "sig";
				},
			});

			await client.request(
				session,
				"sign_message",
				{ message: "hi" },
				{ id: "req-1" },
			);

			expect(seen).toEqual(
				new Map([
					[
						"req-1",
						{
							sessionId: "s1",
							method: "sign_message",
							userInteraction: true,
							startedAt: expect.any(Number),
						},
					],
				]),
			);
			expect(seenEvents).toBe(1);
			expect(events).toEqual([
				[
					"request:pending",
					{
						id: "req-1",
						sessionId: "s1",
						method: "sign_message",
						userInteraction: true,
					},
				],
				[
					"request:settled",
					{ id: "req-1", sessionId: "s1", outcome: "resolved" },
				],
			]);
			expect(client.store.getState().pendingRequests.size).toBe(0);
		});

		it("should label a read as no user interaction", async () => {
			const { client, session, events } = await setup({
				get_addresses: async () => ({ addresses: [] }),
			});

			await client.request(session, "get_addresses", undefined);

			expect(events[0]?.[1]).toMatchObject({ userInteraction: false });
		});

		it("should treat every method as a read when the connector reports no metadata", async () => {
			const { client, session, events } = await setup(
				{ sign_message: async () => "sig" },
				{ metadata: false },
			);

			await client.request(session, "sign_message", { message: "hi" });

			expect(events[0]?.[1]).toMatchObject({ userInteraction: false });
		});

		it("should notify the store once for tracking and once for settling", async () => {
			const { client, session } = await setup({
				get_addresses: async () => ({ addresses: [] }),
			});
			let notifications = 0;
			client.store.subscribe(() => notifications++);

			await client.request(session, "get_addresses", undefined);

			expect(notifications).toBe(2);
		});

		it("should reject CONFIG for an id that is already pending, leaving the first untouched", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const first = client.request(
				session,
				"sign_message",
				{ message: "hi" },
				{ id: "dup" },
			);

			await expect(
				client.request(
					session,
					"sign_message",
					{ message: "hi" },
					{ id: "dup" },
				),
			).rejects.toThrow(ConfigError);
			expect(connector.calls).toHaveLength(1);
			expect(events).toHaveLength(1);

			connector.pending[0]?.resolve("sig");
			await expect(first).resolves.toBe("sig");
			expect(events).toHaveLength(2);
		});
	});

	describe("failures", () => {
		it("should pass a rejection through and settle as rejected", async () => {
			const { client, session, events } = await setup({
				sign_message: "reject",
			});

			const error = await rejection(
				client.request(session, "sign_message", { message: "hi" }, { id: "r" }),
			);

			expect(error).toBeInstanceOf(RequestRejectedError);
			expect(events[1]).toEqual([
				"request:settled",
				{ id: "r", sessionId: "s1", outcome: "rejected" },
			]);
			expect(client.store.getState().pendingRequests.size).toBe(0);
		});

		it("should pass an invalid wallet response through unchanged", async () => {
			const { client, session } = await setup({ sign_message: "malformed" });

			const error = await rejection(
				client.request(session, "sign_message", { message: "hi" }),
			);

			expect(error).toBeInstanceOf(InvalidWalletResponseError);
		});

		it("should pass an unsupported method through", async () => {
			const { client, session } = await setup();

			await expect(
				client.request(session, "get_addresses", undefined),
			).rejects.toBeInstanceOf(MethodUnsupportedError);
		});

		it("should wrap a raw rejection as TRANSPORT with the cause", async () => {
			const cause = new Error("socket closed");
			const { client, session, events } = await setup({
				get_addresses: async () => {
					throw cause;
				},
			});

			const error = await rejection(
				client.request(session, "get_addresses", undefined, { id: "t" }),
			);

			expect(error).toBeInstanceOf(TransportError);
			expect(error.cause).toBe(cause);
			expect(error.sessionId).toBe("s1");
			expect(events[1]?.[1]).toMatchObject({ id: "t", outcome: "rejected" });
		});

		it("should settle a timeout the connector reports as timeout", async () => {
			const { client, session, events } = await setup({
				get_addresses: async () => {
					throw new TimeoutError("relay expiry reached");
				},
			});

			await expect(
				client.request(session, "get_addresses", undefined, { id: "w" }),
			).rejects.toBeInstanceOf(TimeoutError);

			expect(events[1]?.[1]).toMatchObject({ id: "w", outcome: "timeout" });
		});

		it("should wrap a rejection that is not an error", async () => {
			const { client, session } = await setup({
				get_addresses: () => Promise.reject("socket closed"),
			});

			const error = await rejection(
				client.request(session, "get_addresses", undefined),
			);

			expect(error).toBeInstanceOf(TransportError);
			expect(error.cause).toBe("socket closed");
		});

		it("should wrap a synchronous throw from the connector too", async () => {
			const { client, session } = await setup({
				get_addresses: () => {
					throw new TypeError("boom");
				},
			});

			const error = await rejection(
				client.request(session, "get_addresses", undefined),
			);

			expect(error).toBeInstanceOf(TransportError);
			expect(error.cause).toBeInstanceOf(TypeError);
		});
	});

	describe("deadlines", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it("should give a read the client's default of thirty seconds", async () => {
			const { client, connector, session, events } = await setup({
				get_addresses: "hang",
			});
			const failure = rejection(
				client.request(session, "get_addresses", undefined, { id: "r" }),
			);

			expect(connector.calls[0]?.opts?.timeoutMs).toBe(30_000);
			await vi.advanceTimersByTimeAsync(29_999);
			expect(events).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(1);

			expect(await failure).toBeInstanceOf(TimeoutError);
			expect(connector.calls[0]?.signal?.aborted).toBe(true);
			expect(events[1]).toEqual([
				"request:settled",
				{ id: "r", sessionId: "s1", outcome: "timeout" },
			]);
			expect(client.store.getState().pendingRequests.size).toBe(0);
		});

		it("should prefer the method's own deadline over the read default", async () => {
			const { client, connector, session } = await setup({
				get_balance: "hang",
			});
			const failure = rejection(
				client.request(session, "get_balance", { address: "a" }),
			);

			expect(connector.calls[0]?.opts?.timeoutMs).toBe(5_000);
			await vi.advanceTimersByTimeAsync(5_000);

			expect(await failure).toBeInstanceOf(TimeoutError);
		});

		it("should prefer the caller's deadline over everything", async () => {
			const { client, connector, session } = await setup({
				get_balance: "hang",
			});
			const failure = rejection(
				client.request(
					session,
					"get_balance",
					{ address: "a" },
					{ timeoutMs: 10 },
				),
			);

			expect(connector.calls[0]?.opts?.timeoutMs).toBe(10);
			await vi.advanceTimersByTimeAsync(10);

			expect(await failure).toBeInstanceOf(TimeoutError);
		});

		it("should keep the user-interaction label when the caller sets a deadline", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const failure = rejection(
				client.request(
					session,
					"sign_message",
					{ message: "hi" },
					{ timeoutMs: 10, id: "u" },
				),
			);

			expect(client.store.getState().pendingRequests.get("u")).toMatchObject({
				userInteraction: true,
			});
			expect(events[0]?.[1]).toMatchObject({ userInteraction: true });
			expect(connector.calls[0]?.opts?.timeoutMs).toBe(10);
			await vi.advanceTimersByTimeAsync(10);

			expect(await failure).toBeInstanceOf(TimeoutError);
		});

		it("should abort the connector's signal with the timeout as its reason", async () => {
			const { client, connector, session } = await setup({
				get_balance: "hang",
			});
			const failure = rejection(
				client.request(session, "get_balance", { address: "a" }),
			);
			await vi.advanceTimersByTimeAsync(5_000);

			const error = await failure;
			expect(connector.calls[0]?.signal?.reason).toBe(error);
		});

		it("should set no deadline on a request that waits on the user", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const pending = client.request(session, "sign_message", {
				message: "hi",
			});

			expect(vi.getTimerCount()).toBe(0);
			expect(connector.calls[0]?.opts).not.toHaveProperty("timeoutMs");
			await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
			expect(events).toHaveLength(1);

			connector.pending[0]?.resolve("sig");
			await expect(pending).resolves.toBe("sig");
		});

		it("should apply a configured default to requests that wait on the user", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [demoSession({ id: "s1" })],
				methods: { sign_message: "hang" },
				metadata: demoMetadata,
			});
			const client = createClient({
				connectors: [connector],
				network: "chipnet",
				appMetadata,
				defaultTimeoutMs: { userInteraction: 60_000 },
			});
			await client.init();
			const failure = rejection(
				client.request(demoSession({ id: "s1" }), "sign_message", {
					message: "hi",
				}),
			);

			expect(connector.calls[0]?.opts?.timeoutMs).toBe(60_000);
			await vi.advanceTimersByTimeAsync(60_000);

			expect(await failure).toBeInstanceOf(TimeoutError);
		});

		it("should apply a configured read default", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [demoSession({ id: "s1" })],
				methods: { get_addresses: "hang" },
			});
			const client = createClient({
				connectors: [connector],
				network: "chipnet",
				appMetadata,
				defaultTimeoutMs: { read: 100 },
			});
			await client.init();
			const failure = rejection(
				client.request(demoSession({ id: "s1" }), "get_addresses", undefined),
			);

			expect(connector.calls[0]?.opts?.timeoutMs).toBe(100);
			await vi.advanceTimersByTimeAsync(100);

			expect(await failure).toBeInstanceOf(TimeoutError);
		});

		it("should ignore a result that arrives after the deadline", async () => {
			const { client, connector, session, events } = await setup({
				get_balance: "hang",
			});
			const failure = rejection(
				client.request(session, "get_balance", { address: "a" }),
			);
			const held = connector.pending[0];
			await vi.advanceTimersByTimeAsync(5_000);
			expect(await failure).toBeInstanceOf(TimeoutError);

			held?.resolve({ sats: 1n });
			await vi.advanceTimersByTimeAsync(0);

			expect(events).toHaveLength(2);
			expect(client.store.getState().pendingRequests.size).toBe(0);
		});

		it("should clear the timer when the request settles first", async () => {
			const { client, connector, session } = await setup({
				get_balance: "hang",
			});
			const pending = client.request(session, "get_balance", { address: "a" });

			expect(vi.getTimerCount()).toBe(1);
			connector.pending[0]?.resolve({ sats: 1n });
			await expect(pending).resolves.toEqual({ sats: 1n });

			expect(vi.getTimerCount()).toBe(0);
		});

		it.each([0, -1, 1.5e10, Number.NaN, Number.POSITIVE_INFINITY])(
			"should reject CONFIG for the deadline %s",
			async (timeoutMs) => {
				const { client, connector, session, events } = await setup({
					get_addresses: async () => ({ addresses: [] }),
				});

				await expect(
					client.request(session, "get_addresses", undefined, { timeoutMs }),
				).rejects.toThrow(ConfigError);

				expect(connector.calls).toEqual([]);
				expect(events).toEqual([]);
				expect(client.store.getState().pendingRequests.size).toBe(0);
			},
		);
	});

	describe("cancellation", () => {
		it("should reject ABORTED at once and settle as aborted", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const controller = new AbortController();
			const pending = client.request(
				session,
				"sign_message",
				{ message: "hi" },
				{ signal: controller.signal, id: "a" },
			);
			await settle();

			controller.abort(new Error("user closed the modal"));
			const error = await rejection(pending);

			expect(error).toBeInstanceOf(AbortedError);
			expect(error.cause).toEqual(new Error("user closed the modal"));
			expect(connector.calls[0]?.signal?.aborted).toBe(true);
			expect(events[1]).toEqual([
				"request:settled",
				{ id: "a", sessionId: "s1", outcome: "aborted" },
			]);
			expect(client.store.getState().pendingRequests.size).toBe(0);
		});

		it("should ignore a result that arrives after the abort", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const controller = new AbortController();
			const pending = client.request(
				session,
				"sign_message",
				{ message: "hi" },
				{ signal: controller.signal },
			);
			await settle();
			const held = connector.pending[0];

			controller.abort();
			await expect(pending).rejects.toBeInstanceOf(AbortedError);
			held?.resolve("late");
			await settle();

			expect(events).toHaveLength(2);
			expect(client.store.getState().pendingRequests.size).toBe(0);
		});

		it("should reject a signal that is not one before tracking anything", async () => {
			const { client, connector, session, events } = await setup({
				get_addresses: async () => ({ addresses: [] }),
			});

			await expect(
				client.request(session, "get_addresses", undefined, {
					signal: {} as AbortSignal,
				}),
			).rejects.toBeInstanceOf(TypeError);

			expect(connector.calls).toEqual([]);
			expect(events).toEqual([]);
			expect(client.store.getState().pendingRequests.size).toBe(0);
			await expect(client.dispose()).resolves.toBeUndefined();
		});

		it("should not call the connector when the signal is already aborted", async () => {
			const { client, connector, session, events } = await setup({
				get_addresses: async () => ({ addresses: [] }),
			});

			await expect(
				client.request(session, "get_addresses", undefined, {
					signal: AbortSignal.abort(),
				}),
			).rejects.toBeInstanceOf(AbortedError);

			expect(connector.calls).toEqual([]);
			expect(events.map(([name]) => name)).toEqual([
				"request:pending",
				"request:settled",
			]);
			expect(events[1]?.[1]).toMatchObject({ outcome: "aborted" });
		});

		it("should reject ABORTED when the client is disposed while the request is pending", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const pending = client.request(
				session,
				"sign_message",
				{ message: "hi" },
				{ id: "d" },
			);
			await settle();
			let notifications = 0;
			client.store.subscribe(() => notifications++);

			await client.dispose();

			// Settled, and announced, before dispose() resolved.
			expect(events[1]).toEqual([
				"request:settled",
				{ id: "d", sessionId: "s1", outcome: "aborted" },
			]);
			await expect(pending).rejects.toBeInstanceOf(AbortedError);
			expect(connector.calls[0]?.signal?.aborted).toBe(true);
			expect(client.store.getState().pendingRequests.size).toBe(0);
			// The teardown's own transition; the request adds none.
			expect(notifications).toBe(1);
		});
	});

	describe("session end", () => {
		it("should reject SESSION_MISSING when the session is disconnected by the dapp", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const pending = client.request(
				session,
				"sign_message",
				{ message: "hi" },
				{ id: "e" },
			);
			await settle();

			await client.disconnect(session);

			const error = await rejection(pending);
			expect(error).toBeInstanceOf(SessionMissingError);
			expect(error.sessionId).toBe("s1");
			expect(error.cause).toBe("user");
			expect(connector.calls[0]?.signal?.aborted).toBe(true);
			expect(events[1]).toEqual([
				"request:settled",
				{ id: "e", sessionId: "s1", outcome: "rejected" },
			]);
			expect(client.store.getState().pendingRequests.size).toBe(0);
		});

		it("should carry the reason when the wallet ends the session", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const pending = client.request(session, "sign_message", {
				message: "hi",
			});
			await settle();

			connector.emit("session:disconnected", {
				sessionId: "s1",
				reason: "wallet",
			});

			const error = await rejection(pending);
			expect(error).toBeInstanceOf(SessionMissingError);
			expect(error.cause).toBe("wallet");
			expect(events[1]?.[1]).toMatchObject({ outcome: "rejected" });
		});

		it("should keep an earlier abort when the session ends in the same tick", async () => {
			const { client, connector, session, events } = await setup({
				sign_message: "hang",
			});
			const controller = new AbortController();
			const pending = client.request(
				session,
				"sign_message",
				{ message: "hi" },
				{ signal: controller.signal },
			);
			await settle();

			controller.abort();
			connector.emit("session:disconnected", {
				sessionId: "s1",
				reason: "wallet",
			});

			await expect(pending).rejects.toBeInstanceOf(AbortedError);
			expect(events[1]?.[1]).toMatchObject({ outcome: "aborted" });
		});

		it("should reject a request issued while the session is being announced as gone", async () => {
			const { client, session } = await setup({
				get_addresses: async () => ({ addresses: [] }),
			});
			let issued: Promise<unknown> | undefined;
			client.on("session:disconnected", () => {
				issued = client.request(session, "get_addresses", undefined);
			});

			await client.disconnect(session);

			await expect(issued).rejects.toBeInstanceOf(SessionMissingError);
		});

		it("should end the requests of a session that connect() replaces", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: [demoSession({ id: "s1" })],
				session: demoSession({ id: "s2" }),
				methods: { sign_message: "hang" },
			});
			const client = createClient({
				connectors: [connector],
				network: "chipnet",
				appMetadata,
			});
			await client.init();
			const pending = client.request(
				demoSession({ id: "s1" }),
				"sign_message",
				{
					message: "hi",
				},
			);
			await settle();

			await client.connect("demo");

			const error = await rejection(pending);
			expect(error).toBeInstanceOf(SessionMissingError);
			expect(error.sessionId).toBe("s1");
		});

		it("should leave the requests of other sessions alone", async () => {
			const first = demoSession({ id: "s1" });
			const other = demoSession({ id: "s2" });
			const { client, connector, events } = await setup(
				{ sign_message: "hang" },
				{ restore: [first, other] },
			);
			const kept = client.request(other, "sign_message", { message: "hi" });
			await settle();

			await client.disconnect(first);
			await settle();

			expect(events).toHaveLength(1);
			expect(connector.pending[0]?.signal?.aborted).toBe(false);
			connector.pending[0]?.resolve("sig");
			await expect(kept).resolves.toBe("sig");
		});
	});
});

describe("subscribe", () => {
	it("should deliver the connector's events to the listener", async () => {
		const { client, connector, session } = await setup();
		const seen: unknown[] = [];

		client.subscribe(session, "wallet_ready", (payload) => seen.push(payload));
		connector.emitProtocolEvent(session, "wallet_ready", { walletName: "W" });

		expect(seen).toEqual([{ walletName: "W" }]);
		expect(connector.log).toContainEqual({
			kind: "subscribe",
			sessionId: "s1",
			event: "wallet_ready",
		});
	});

	it("should throw SESSION_MISSING for a session that is not connected", async () => {
		const { client, connector } = await setup({}, { restore: [] });
		const stranger = demoSession({ id: "stranger" });

		expect(() => client.subscribe(stranger, "wallet_ready", () => {})).toThrow(
			SessionMissingError,
		);
		expect(connector.log.some((entry) => entry.kind === "subscribe")).toBe(
			false,
		);
	});

	it("should subscribe on the session in state when the caller holds an older snapshot", async () => {
		const { client, connector, session } = await setup();
		const changed = demoSession({
			id: "s1",
			status: { transport: "reconnecting", peer: "unknown" },
		});
		connector.emit("session:changed", { session: changed, previous: session });
		const delegate = vi.spyOn(connector, "subscribe");

		client.subscribe(session, "wallet_ready", () => {});

		expect(delegate.mock.calls[0]?.[0]).toBe(changed);
	});

	it("should unsubscribe on the connector once, however many times it is called", async () => {
		const { client, connector, session } = await setup();
		const off = vi.fn();
		vi.spyOn(connector, "subscribe").mockReturnValue(off);
		const unsubscribe = client.subscribe(session, "wallet_ready", () => {});

		unsubscribe();
		unsubscribe();

		expect(off).toHaveBeenCalledTimes(1);
	});

	it("should end the subscription when the dapp disconnects the session", async () => {
		const { client, connector, session } = await setup();
		const off = vi.fn();
		vi.spyOn(connector, "subscribe").mockReturnValue(off);
		const unsubscribe = client.subscribe(session, "wallet_ready", () => {});

		await client.disconnect(session);
		unsubscribe();

		expect(off).toHaveBeenCalledTimes(1);
	});

	it("should not unsubscribe again at session end after the dapp did", async () => {
		const { client, connector, session } = await setup();
		const off = vi.fn();
		vi.spyOn(connector, "subscribe").mockReturnValue(off);
		const unsubscribe = client.subscribe(session, "wallet_ready", () => {});

		unsubscribe();
		await client.disconnect(session);

		expect(off).toHaveBeenCalledTimes(1);
	});

	it("should end every subscription when the wallet ends the session", async () => {
		const { client, connector, session } = await setup();
		client.subscribe(session, "wallet_ready", () => {});
		client.subscribe(session, "wallet_ready", () => {});
		client.subscribe(session, "addresses_changed", () => {});

		connector.emit("session:disconnected", {
			sessionId: "s1",
			reason: "wallet",
		});

		expect(
			connector.log.filter((entry) => entry.kind === "unsubscribe"),
		).toHaveLength(3);
	});

	it("should leave the subscriptions of other sessions alone", async () => {
		const first = demoSession({ id: "s1" });
		const other = demoSession({ id: "s2" });
		const { client, connector } = await setup({}, { restore: [first, other] });
		const seen: unknown[] = [];
		client.subscribe(other, "wallet_ready", (payload) => seen.push(payload));

		await client.disconnect(first);
		connector.emitProtocolEvent(other, "wallet_ready", { walletName: "W" });

		expect(seen).toEqual([{ walletName: "W" }]);
	});

	it("should end every subscription when the client is disposed", async () => {
		const first = demoSession({ id: "s1" });
		const other = demoSession({ id: "s2" });
		const { client, connector } = await setup({}, { restore: [first, other] });
		const off = vi.fn();
		vi.spyOn(connector, "subscribe").mockReturnValue(off);
		const unsubscribe = client.subscribe(first, "wallet_ready", () => {});
		client.subscribe(other, "wallet_ready", () => {});

		await client.dispose();
		unsubscribe();

		expect(off).toHaveBeenCalledTimes(2);
	});
});
