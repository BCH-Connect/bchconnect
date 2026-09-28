import { describe, expect, it, vi } from "vitest";
import {
	isClientSnapshot,
	parseSnapshot,
	SNAPSHOT_KEY,
	serializeSnapshot,
	toSnapshot,
} from "../src/snapshot.js";
import type { ClientSnapshot } from "../src/types/client.js";
import type { Logger, Session } from "../src/types/protocol.js";

function createLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

function createSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "session-1",
		protocol: "wizardconnect",
		wallet: { source: "protocol", name: "Cashonize" },
		data: { some: "handshake" },
		status: { transport: "connected", peer: "reachable" },
		...overrides,
	};
}

const VALID_SESSION: ClientSnapshot["sessions"][number] = {
	id: "session-1",
	protocol: "wizardconnect",
	network: "chipnet",
	wallet: { source: "protocol", name: "Cashonize" },
};

const VALID_SNAPSHOT: ClientSnapshot = {
	version: 1,
	currentSessionId: "session-1",
	sessions: [VALID_SESSION],
};

describe("snapshot", () => {
	it("should expose the persisted snapshot storage key", () => {
		expect(SNAPSHOT_KEY).toBe("bchconnect:client:v1");
	});

	describe("isClientSnapshot", () => {
		it("should accept a well-formed snapshot", () => {
			expect(isClientSnapshot(VALID_SNAPSHOT)).toBe(true);
		});

		it("should accept a snapshot with a null prototype", () => {
			const snapshot = Object.assign(Object.create(null), VALID_SNAPSHOT);

			expect(isClientSnapshot(snapshot)).toBe(true);
		});

		it("should accept a null currentSessionId with no sessions", () => {
			expect(
				isClientSnapshot({ version: 1, currentSessionId: null, sessions: [] }),
			).toBe(true);
		});

		const without = (record: object, key: string): Record<string, unknown> =>
			Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
		const withSession = (overrides: Record<string, unknown>): unknown => ({
			...VALID_SNAPSHOT,
			sessions: [{ ...VALID_SESSION, ...overrides }],
		});

		it.each([
			{ label: "a string", value: "not an object" },
			{ label: "null", value: null },
			{ label: "undefined", value: undefined },
			{ label: "a number", value: 42 },
			{ label: "an array", value: [] },
			{ label: "a Map", value: new Map([["version", 1]]) },
			{
				label: "a class instance",
				value: new (class Snapshot {
					version = 1;
					currentSessionId = null;
					sessions = [];
				})(),
			},
			{
				label: "an object whose fields are only inherited",
				value: Object.create({
					version: 1,
					currentSessionId: null,
					sessions: [],
				}),
			},
			{
				label: "the wrong schema version",
				value: { ...VALID_SNAPSHOT, version: 2 },
			},
			{
				label: "sessions that are not an array",
				value: { ...VALID_SNAPSHOT, sessions: "nope" },
			},
			{
				label: "a session entry that is not an object",
				value: { ...VALID_SNAPSHOT, sessions: ["nope"] },
			},
			{
				label: "a session without an id",
				value: { ...VALID_SNAPSHOT, sessions: [without(VALID_SESSION, "id")] },
			},
			{
				label: "a snapshot without sessions",
				value: without(VALID_SNAPSHOT, "sessions"),
			},
			{
				label: "a snapshot without currentSessionId",
				value: without(VALID_SNAPSHOT, "currentSessionId"),
			},
			{
				label: "a session without a protocol",
				value: {
					...VALID_SNAPSHOT,
					sessions: [without(VALID_SESSION, "protocol")],
				},
			},
			{
				label: "a session without a network",
				value: {
					...VALID_SNAPSHOT,
					sessions: [without(VALID_SESSION, "network")],
				},
			},
			{
				label: "a session without a wallet",
				value: {
					...VALID_SNAPSHOT,
					sessions: [without(VALID_SESSION, "wallet")],
				},
			},
			{
				label: "a session with a non-string id",
				value: withSession({ id: 1 }),
			},
			{
				label: "a session with a non-string protocol",
				value: withSession({ protocol: 1 }),
			},
			{
				label: "a session with a non-string network",
				value: withSession({ network: 1 }),
			},
			{
				label: "a wallet without a source",
				value: withSession({ wallet: { name: "Cashonize" } }),
			},
			{
				label: "a wallet with a non-string source",
				value: withSession({ wallet: { source: 1 } }),
			},
			{
				label: "a wallet with a non-string id",
				value: withSession({ wallet: { source: "protocol", id: 1 } }),
			},
			{
				label: "a wallet with a non-string icon",
				value: withSession({ wallet: { source: "protocol", icon: 1 } }),
			},
			{
				label: "a session with an unknown network",
				value: withSession({ network: "testnet" }),
			},
			{ label: "a non-object wallet", value: withSession({ wallet: "nope" }) },
			{
				label: "a wallet with an invalid source",
				value: withSession({ wallet: { source: "wire" } }),
			},
			{
				label: "a wallet with a non-string name",
				value: withSession({ wallet: { source: "protocol", name: 7 } }),
			},
			{
				label: "a currentSessionId that names no session",
				value: { ...VALID_SNAPSHOT, currentSessionId: "missing" },
			},
			{
				label: "a currentSessionId of the wrong type",
				value: { ...VALID_SNAPSHOT, currentSessionId: 1 },
			},
		])("should reject $label", ({ value }) => {
			expect(isClientSnapshot(value)).toBe(false);
		});

		it("should accept a wallet with only the required source", () => {
			expect(
				isClientSnapshot({
					...VALID_SNAPSHOT,
					sessions: [{ ...VALID_SESSION, wallet: { source: "selection" } }],
				}),
			).toBe(true);
		});
	});

	describe("toSnapshot", () => {
		it("should project id, protocol, wallet and network per session", () => {
			const sessions = new Map([["session-1", createSession()]]);

			const snapshot = toSnapshot(
				{ sessions, currentSessionId: "session-1" },
				"chipnet",
			);

			expect(snapshot).toEqual({
				version: 1,
				currentSessionId: "session-1",
				sessions: [
					{
						id: "session-1",
						protocol: "wizardconnect",
						wallet: { source: "protocol", name: "Cashonize" },
						network: "chipnet",
					},
				],
			});
		});

		it("should exclude session data and status", () => {
			const sessions = new Map([["session-1", createSession()]]);

			const snapshot = toSnapshot(
				{ sessions, currentSessionId: null },
				"mainnet",
			);

			const [entry] = snapshot.sessions;
			expect(entry).not.toHaveProperty("data");
			expect(entry).not.toHaveProperty("status");
		});

		it("should omit undefined optional wallet fields", () => {
			const sessions = new Map([
				[
					"session-1",
					createSession({ wallet: { source: "selection", id: "cashonize" } }),
				],
			]);

			const snapshot = toSnapshot(
				{ sessions, currentSessionId: null },
				"mainnet",
			);

			expect(Object.keys(snapshot.sessions[0]?.wallet ?? {})).toEqual([
				"source",
				"id",
			]);
		});

		it("should copy every present optional wallet field", () => {
			const sessions = new Map([
				[
					"session-1",
					createSession({
						wallet: {
							source: "protocol",
							id: "cashonize",
							name: "Cashonize",
							icon: "https://example.com/icon.png",
						},
					}),
				],
			]);

			const snapshot = toSnapshot(
				{ sessions, currentSessionId: null },
				"mainnet",
			);

			expect(snapshot.sessions[0]?.wallet).toEqual({
				source: "protocol",
				id: "cashonize",
				name: "Cashonize",
				icon: "https://example.com/icon.png",
			});
		});

		it("should drop wallet fields outside the identity", () => {
			const wallet = {
				source: "protocol" as const,
				name: "Cashonize",
				sessionKey: "not for storage",
			};
			const sessions = new Map([["session-1", createSession({ wallet })]]);

			const snapshot = toSnapshot(
				{ sessions, currentSessionId: null },
				"mainnet",
			);

			expect(snapshot.sessions[0]?.wallet).toEqual({
				source: "protocol",
				name: "Cashonize",
			});
		});

		it("should preserve Map insertion order", () => {
			const sessions = new Map([
				["b", createSession({ id: "b" })],
				["a", createSession({ id: "a" })],
			]);

			const snapshot = toSnapshot(
				{ sessions, currentSessionId: null },
				"mainnet",
			);

			expect(snapshot.sessions.map((session) => session.id)).toEqual([
				"b",
				"a",
			]);
		});

		it("should carry the current session id", () => {
			const sessions = new Map([["session-1", createSession()]]);

			const snapshot = toSnapshot(
				{ sessions, currentSessionId: "session-1" },
				"mainnet",
			);

			expect(snapshot.currentSessionId).toBe("session-1");
		});

		it("should produce an empty sessions array when there are no sessions", () => {
			const snapshot = toSnapshot(
				{ sessions: new Map(), currentSessionId: null },
				"mainnet",
			);

			expect(snapshot).toEqual({
				version: 1,
				currentSessionId: null,
				sessions: [],
			});
		});
	});

	describe("serializeSnapshot / parseSnapshot round trip", () => {
		it("should parse back an equal snapshot after serializing", () => {
			const logger = createLogger();

			const parsed = parseSnapshot(serializeSnapshot(VALID_SNAPSHOT), logger);

			expect(parsed).toEqual(VALID_SNAPSHOT);
			expect(logger.debug).not.toHaveBeenCalled();
		});

		it("should serialize with JSON.stringify", () => {
			expect(serializeSnapshot(VALID_SNAPSHOT)).toBe(
				JSON.stringify(VALID_SNAPSHOT),
			);
		});
	});

	describe("parseSnapshot", () => {
		it("should return undefined without logging when raw is undefined", () => {
			const logger = createLogger();

			expect(parseSnapshot(undefined, logger)).toBeUndefined();
			expect(logger.debug).not.toHaveBeenCalled();
		});

		it("should return undefined and log once on invalid JSON", () => {
			const logger = createLogger();

			expect(parseSnapshot("{not json", logger)).toBeUndefined();
			expect(logger.debug).toHaveBeenCalledTimes(1);
		});

		it("should return undefined and log once when the shape is malformed", () => {
			const logger = createLogger();

			expect(
				parseSnapshot(JSON.stringify({ version: 2 }), logger),
			).toBeUndefined();
			expect(logger.debug).toHaveBeenCalledTimes(1);
		});

		it("should return an equal object for a valid snapshot", () => {
			const logger = createLogger();

			expect(parseSnapshot(JSON.stringify(VALID_SNAPSHOT), logger)).toEqual(
				VALID_SNAPSHOT,
			);
		});
	});
});
