import type { KeyValueStore } from "../types/protocol.js";

/**
 * Creates a key-value store held in memory. Each call returns an independent
 * store; its contents are lost when the page or process ends.
 *
 * @example
 * ```ts
 * const storage = memory();
 * await storage.set("key", "value");
 * await storage.get("key"); // "value"
 * ```
 *
 * @internal
 */
export function memory(): KeyValueStore {
	const entries = new Map<string, string>();

	return {
		async get(key) {
			return entries.get(key);
		},
		async set(key, value) {
			entries.set(key, value);
		},
		async delete(key) {
			entries.delete(key);
		},
	};
}
