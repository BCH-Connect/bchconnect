import type { DemoAltProtocol, DemoProtocol } from "@bchconnect/test-utils";
import {
	createFakeConnector,
	demoAltSession,
	demoSession,
} from "@bchconnect/test-utils";
import { describe, expect, it, vi } from "vitest";
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
