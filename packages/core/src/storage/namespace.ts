import type { KeyValueStore } from "../types/protocol.js";

/**
 * Returns the storage key prefix reserved for a protocol's connector.
 *
 * @example
 * ```ts
 * connectorPrefix("wizard"); // "bchconnect:wizard:"
 * ```
 *
 * @internal
 */
export function connectorPrefix(protocol: string): string {
	return `bchconnect:${protocol}:`;
}

/**
 * Wraps a key-value store so every key is read and written under a prefix.
 * Callers see their own keys unchanged; the underlying store holds the
 * prefixed ones.
 *
 * @example
 * ```ts
 * const storage = namespaced(memory(), connectorPrefix("wizard"));
 * await storage.set("credentials", "…"); // stored as "bchconnect:wizard:credentials"
 * ```
 *
 * @internal
 */
export function namespaced(
	store: KeyValueStore,
	prefix: string,
): KeyValueStore {
	return {
		get(key) {
			return store.get(prefix + key);
		},
		set(key, value) {
			return store.set(prefix + key, value);
		},
		delete(key) {
			return store.delete(prefix + key);
		},
	};
}
