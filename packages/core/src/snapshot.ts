import type { ClientSnapshot, ClientState } from "./types/client.js";
import type { Logger, Network, WalletIdentity } from "./types/protocol.js";

/**
 * Storage key under which the client-tier snapshot is persisted.
 *
 * @example
 * ```ts
 * await storage.delete(SNAPSHOT_KEY);
 * ```
 *
 * @internal
 */
export const SNAPSHOT_KEY: "bchconnect:client:v1" = "bchconnect:client:v1";

const NETWORKS: ReadonlySet<string> = new Set<Network>([
	"mainnet",
	"chipnet",
	"regtest",
]);

const WALLET_SOURCES: ReadonlySet<string> = new Set<WalletIdentity["source"]>([
	"protocol",
	"selection",
]);

function isPlainObject(value: unknown): value is object {
	if (typeof value !== "object" || value === null) return false;

	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function isWalletIdentity(value: unknown): value is WalletIdentity {
	if (!isPlainObject(value)) return false;
	if (!("source" in value)) return false;

	return (
		typeof value.source === "string" &&
		WALLET_SOURCES.has(value.source) &&
		(!("id" in value) || typeof value.id === "string") &&
		(!("name" in value) || typeof value.name === "string") &&
		(!("icon" in value) || typeof value.icon === "string")
	);
}

function isSnapshotSession(
	value: unknown,
): value is ClientSnapshot["sessions"][number] {
	if (!isPlainObject(value)) return false;
	if (!("id" in value) || typeof value.id !== "string") return false;
	if (!("protocol" in value) || typeof value.protocol !== "string") {
		return false;
	}
	if (!("network" in value)) return false;

	return (
		typeof value.network === "string" &&
		NETWORKS.has(value.network) &&
		"wallet" in value &&
		isWalletIdentity(value.wallet)
	);
}

/**
 * Reports whether `value` is a well-formed {@link ClientSnapshot}: schema
 * version 1, a `currentSessionId` that either is `null` or matches one of
 * `sessions`, and sessions whose shape core can safely trust.
 *
 * @example
 * ```ts
 * const parsed: unknown = JSON.parse(raw);
 * if (isClientSnapshot(parsed)) {
 *   // parsed is now a ClientSnapshot
 * }
 * ```
 *
 * @internal
 */
export function isClientSnapshot(value: unknown): value is ClientSnapshot {
	if (!isPlainObject(value)) return false;
	if (!("version" in value) || value.version !== 1) return false;
	if (!("sessions" in value) || !Array.isArray(value.sessions)) return false;
	if (!("currentSessionId" in value)) return false;

	const sessions: unknown[] = value.sessions;
	if (!sessions.every(isSnapshotSession)) return false;

	const { currentSessionId } = value;
	if (currentSessionId === null) return true;
	if (typeof currentSessionId !== "string") return false;

	return sessions.some((session) => session.id === currentSessionId);
}

// Copies only the identity fields, so nothing else a connector attached reaches storage.
function toWalletIdentity(wallet: WalletIdentity): WalletIdentity {
	const copy: WalletIdentity = { source: wallet.source };
	if (wallet.id !== undefined) copy.id = wallet.id;
	if (wallet.name !== undefined) copy.name = wallet.name;
	if (wallet.icon !== undefined) copy.icon = wallet.icon;

	return copy;
}

/**
 * Projects live client state into a {@link ClientSnapshot}: id, protocol,
 * wallet identity and `network` per session, in insertion order. Never
 * carries a session's `data` or `status`.
 *
 * @example
 * ```ts
 * const snapshot = toSnapshot(store.getState(), config.network);
 * ```
 *
 * @internal
 */
export function toSnapshot(
	state: Pick<ClientState, "sessions" | "currentSessionId">,
	network: Network,
): ClientSnapshot {
	const sessions: ClientSnapshot["sessions"] = Array.from(
		state.sessions.values(),
		(session) => ({
			id: session.id,
			protocol: session.protocol,
			wallet: toWalletIdentity(session.wallet),
			network,
		}),
	);

	return {
		version: 1,
		currentSessionId: state.currentSessionId,
		sessions,
	};
}

/**
 * Serializes a {@link ClientSnapshot} for storage.
 *
 * @example
 * ```ts
 * await storage.set(SNAPSHOT_KEY, serializeSnapshot(snapshot));
 * ```
 *
 * @internal
 */
export function serializeSnapshot(snapshot: ClientSnapshot): string {
	return JSON.stringify(snapshot);
}

/**
 * Parses a persisted snapshot. Returns `undefined` without logging when
 * `raw` is `undefined` (nothing was ever persisted); returns `undefined` and
 * logs one `debug` message when `raw` is invalid JSON or does not describe a
 * well-formed {@link ClientSnapshot}. Never throws.
 *
 * @example
 * ```ts
 * const snapshot = parseSnapshot(await storage.get(SNAPSHOT_KEY), logger);
 * ```
 *
 * @internal
 */
export function parseSnapshot(
	raw: string | undefined,
	logger: Logger,
): ClientSnapshot | undefined {
	if (raw === undefined) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		logger.debug("Discarding unparsable client snapshot", error);
		return undefined;
	}

	if (!isClientSnapshot(parsed)) {
		logger.debug("Discarding malformed client snapshot", parsed);
		return undefined;
	}

	return parsed;
}
