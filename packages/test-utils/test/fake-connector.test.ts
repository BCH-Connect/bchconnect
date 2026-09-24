import type { Pairing } from "@bchconnect/core";
import { describe, expect, it, vi } from "vitest";
import {
	createFakeConnector,
	type DemoProtocol,
	demoSession,
} from "../src/index.js";
import { fakeContext } from "./fixtures/context.js";

const session = demoSession({ id: "s1" });

describe("createFakeConnector", () => {
	it("should expose the scripted protocol id", () => {
		const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });

		expect(connector.protocol).toBe("demo");
	});

	describe("setup", () => {
		it("should record the call and keep the context", () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
			const context = fakeContext();

			connector.setup?.(context);
			connector.emit("session:connected", { session });

			expect(connector.log).toEqual([{ kind: "setup" }]);
			expect(context.emitted).toEqual([
				{ event: "session:connected", payload: { session } },
			]);
		});

		it("should write nothing to storage", () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
			const context = fakeContext();

			connector.setup?.(context);

			expect(context.storage.entries.size).toBe(0);
		});

		it("should throw when scripted to", () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				setup: "throw",
			});

			expect(() => connector.setup?.(fakeContext())).toThrow(/failed setup/);
		});
	});

	describe("emit", () => {
		it("should throw before setup ran", () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });

			expect(() =>
				connector.emit("session:disconnected", {
					sessionId: session.id,
					reason: "wallet",
				}),
			).toThrow(/before setup/);
		});
	});

	describe("connect", () => {
		it("should resolve with the scripted session, unchanged, on every call", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
			});

			expect(await connector.connect({})).toBe(session);
			expect(await connector.connect({})).toBe(session);
		});

		it("should call a session factory once per connect", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session: () => demoSession(),
			});

			const first = await connector.connect({});
			const second = await connector.connect({});

			expect(first.id).not.toBe(second.id);
		});

		it("should throw when no session is scripted", async () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });

			await expect(connector.connect({})).rejects.toThrow(/no session/);
		});

		it("should hand pairing material to onPairing before resolving", async () => {
			const pairing: Pairing = { kind: "uri", uri: "demo:pair" };
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
				pairing,
			});
			const seen: Pairing[] = [];

			const connected = connector.connect({
				onPairing: (value) => seen.push(value),
			});

			expect(seen).toEqual([pairing]);
			await connected;
		});

		it("should not call onPairing when no pairing is scripted", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
			});
			const onPairing = vi.fn();

			await connector.connect({ onPairing });

			expect(onPairing).not.toHaveBeenCalled();
		});

		it("should record the timeout it was given without enforcing it", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
			});

			await connector.connect({ timeoutMs: 50 });

			expect(connector.log).toEqual([{ kind: "connect", timeoutMs: 50 }]);
		});

		it("should reject REJECTED when scripted to reject", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				connect: "reject",
			});

			await expect(connector.connect({})).rejects.toMatchObject({
				code: "REJECTED",
				by: "user",
			});
		});

		it("should reject ABORTED when a hanging connect is aborted", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				connect: "hang",
			});
			const controller = new AbortController();

			const connected = connector.connect({ signal: controller.signal });
			controller.abort();

			await expect(connected).rejects.toMatchObject({ code: "ABORTED" });
		});

		it("should reject ABORTED when the signal is already aborted", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
			});

			await expect(
				connector.connect({ signal: AbortSignal.abort() }),
			).rejects.toMatchObject({ code: "ABORTED" });
		});

		it("should pass its options to a connect function", async () => {
			const connect = vi.fn(async () => session);
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				connect,
			});
			const controller = new AbortController();

			await connector.connect({ signal: controller.signal, timeoutMs: 10 });

			expect(connect).toHaveBeenCalledWith({
				signal: controller.signal,
				timeoutMs: 10,
			});
		});

		it("should write a storage marker once the session exists", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
			});
			const context = fakeContext();
			connector.setup?.(context);

			await connector.connect({});

			expect([...context.storage.entries.keys()]).toEqual([
				`session:${session.id}`,
			]);
		});

		it("should write nothing when persistence is off", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
				persist: false,
			});
			const context = fakeContext();
			connector.setup?.(context);

			await connector.connect({});

			expect(context.storage.entries.size).toBe(0);
		});
	});

	describe("restore", () => {
		it("should return an empty list by default", async () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });

			expect(await connector.restore()).toEqual([]);
			expect(connector.log).toEqual([{ kind: "restore" }]);
		});

		it("should return a copy of the scripted sessions", async () => {
			const scripted = [session];
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: scripted,
			});

			const restored = await connector.restore();

			expect(restored).toEqual(scripted);
			expect(restored).not.toBe(scripted);
		});

		it("should await a restore function", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: async () => [session],
			});

			expect(await connector.restore()).toEqual([session]);
		});

		it("should reject when scripted to throw", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				restore: "throw",
			});

			await expect(connector.restore()).rejects.toThrow(/failed restore/);
		});
	});

	describe("disconnect", () => {
		it("should remove the storage marker and stay idempotent", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
			});
			const context = fakeContext();
			connector.setup?.(context);
			await connector.connect({});

			await connector.disconnect(session);
			await connector.disconnect(session);

			expect(context.storage.entries.size).toBe(0);
			expect(connector.log).toContainEqual({
				kind: "disconnect",
				sessionId: session.id,
			});
		});

		it("should remove the marker before failing, when scripted to throw", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				session,
				disconnect: "throw",
			});
			const context = fakeContext();
			connector.setup?.(context);
			await connector.connect({});

			await expect(connector.disconnect(session)).rejects.toThrow(
				/failed to disconnect/,
			);
			expect(context.storage.entries.size).toBe(0);
		});
	});

	describe("request", () => {
		it("should record every call", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				methods: { get_balance: async () => ({ sats: 7n }) },
			});
			const signal = new AbortController().signal;

			const result = await connector.request(
				session,
				"get_balance",
				{ address: "bitcoincash:qpea4gc3r589sdqdcprsu6uyxpugpqnshsa8v7vsxq" },
				{ id: "r1", signal },
			);

			expect(result).toEqual({ sats: 7n });
			expect(connector.calls).toEqual([
				{
					sessionId: session.id,
					method: "get_balance",
					params: {
						address: "bitcoincash:qpea4gc3r589sdqdcprsu6uyxpugpqnshsa8v7vsxq",
					},
					opts: { id: "r1", signal },
					signal,
				},
			]);
			expect(connector.log).toEqual([
				{ kind: "request", sessionId: session.id, method: "get_balance" },
			]);
		});

		it("should reject METHOD_UNSUPPORTED for a method left out of the script", async () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });

			await expect(
				connector.request(session, "get_addresses", undefined),
			).rejects.toMatchObject({
				code: "METHOD_UNSUPPORTED",
				sessionId: session.id,
			});
		});

		it("should reject REJECTED when the method is scripted to reject", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				methods: { sign_message: "reject" },
			});

			await expect(
				connector.request(session, "sign_message", { message: "hi" }),
			).rejects.toMatchObject({ code: "REJECTED", by: "user" });
		});

		it("should reject INVALID_WALLET_RESPONSE for a malformed reply", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				methods: { sign_message: "malformed" },
			});

			await expect(
				connector.request(session, "sign_message", { message: "hi" }),
			).rejects.toMatchObject({
				code: "INVALID_WALLET_RESPONSE",
				sessionId: session.id,
			});
		});

		it("should reject ABORTED when the signal is already aborted", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				methods: { get_addresses: async () => ({ addresses: [] }) },
			});

			await expect(
				connector.request(session, "get_addresses", undefined, {
					signal: AbortSignal.abort(),
				}),
			).rejects.toMatchObject({ code: "ABORTED" });
		});

		describe("a hanging method", () => {
			it("should park the call until the test settles it", async () => {
				const connector = createFakeConnector<DemoProtocol>({
					protocol: "demo",
					methods: { sign_message: "hang" },
				});

				const pending = connector.request(session, "sign_message", {
					message: "hi",
				});

				expect(connector.pending).toHaveLength(1);
				expect(connector.pending[0]?.method).toBe("sign_message");

				connector.pending[0]?.resolve("signature");

				expect(await pending).toBe("signature");
				expect(connector.pending).toHaveLength(0);
			});

			it("should ignore a second settlement", async () => {
				const connector = createFakeConnector<DemoProtocol>({
					protocol: "demo",
					methods: { sign_message: "hang" },
				});

				const pending = connector.request(session, "sign_message", {
					message: "hi",
				});
				const held = connector.pending[0];
				held?.resolve("first");
				held?.reject(new Error("too late"));

				expect(await pending).toBe("first");
			});

			it("should settle with an error when told to", async () => {
				const connector = createFakeConnector<DemoProtocol>({
					protocol: "demo",
					methods: { sign_message: "hang" },
				});

				const pending = connector.request(session, "sign_message", {
					message: "hi",
				});
				connector.pending[0]?.reject(new Error("wallet exploded"));

				await expect(pending).rejects.toThrow("wallet exploded");
				expect(connector.pending).toHaveLength(0);
			});

			it("should reject ABORTED when its signal aborts", async () => {
				const connector = createFakeConnector<DemoProtocol>({
					protocol: "demo",
					methods: { sign_message: "hang" },
				});
				const controller = new AbortController();

				const pending = connector.request(
					session,
					"sign_message",
					{ message: "hi" },
					{ signal: controller.signal },
				);
				controller.abort();

				await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
				expect(connector.pending).toHaveLength(0);
			});
		});
	});

	describe("subscribe", () => {
		it("should deliver events to the listeners of that session and event", () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
			const other = demoSession({ id: "s2" });
			const listener = vi.fn();
			const otherListener = vi.fn();
			const otherEvent = vi.fn();

			connector.subscribe(session, "addresses_changed", listener);
			connector.subscribe(other, "addresses_changed", otherListener);
			connector.subscribe(session, "wallet_ready", otherEvent);

			connector.emitProtocolEvent(session, "addresses_changed", {
				addresses: ["bitcoincash:qpea4gc3r589sdqdcprsu6uyxpugpqnshsa8v7vsxq"],
			});

			expect(listener).toHaveBeenCalledWith({
				addresses: ["bitcoincash:qpea4gc3r589sdqdcprsu6uyxpugpqnshsa8v7vsxq"],
			});
			expect(otherListener).not.toHaveBeenCalled();
			expect(otherEvent).not.toHaveBeenCalled();
		});

		it("should stop delivery after unsubscribe, and ignore a repeated one", () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
			const listener = vi.fn();

			const unsubscribe = connector.subscribe(
				session,
				"wallet_ready",
				listener,
			);
			unsubscribe();
			unsubscribe();
			connector.emitProtocolEvent(session, "wallet_ready", {});

			expect(listener).not.toHaveBeenCalled();
			expect(
				connector.log.filter((entry) => entry.kind === "unsubscribe"),
			).toHaveLength(1);
		});

		it("should ignore an event nobody subscribed to", () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });

			expect(() =>
				connector.emitProtocolEvent(session, "wallet_ready", {}),
			).not.toThrow();
		});
	});

	describe("capabilitiesOf", () => {
		it("should be empty by default", () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });

			expect([...connector.capabilitiesOf(session)]).toEqual([]);
		});

		it("should return the scripted list", () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				capabilities: ["libauth-signing"],
			});

			expect([...connector.capabilitiesOf(session)]).toEqual([
				"libauth-signing",
			]);
		});

		it("should compute capabilities per session", () => {
			const other = demoSession({ id: "s2" });
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				capabilities: (subject) =>
					subject.id === session.id ? ["message-signing"] : [],
			});

			expect([...connector.capabilitiesOf(session)]).toEqual([
				"message-signing",
			]);
			expect([...connector.capabilitiesOf(other)]).toEqual([]);
		});
	});

	describe("dispose", () => {
		it("should record the call", async () => {
			const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });

			await connector.dispose?.();

			expect(connector.log).toEqual([{ kind: "dispose" }]);
		});

		it("should reject when scripted to throw", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
				dispose: "throw",
			});

			await expect(connector.dispose?.()).rejects.toThrow(/failed dispose/);
		});
	});
});
