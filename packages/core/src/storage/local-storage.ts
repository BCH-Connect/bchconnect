import type { KeyValueStore } from "../types/protocol.js";
import { memory } from "./memory.js";

/**
 * Creates a key-value store backed by the browser's `localStorage`. Where Web
 * Storage is unavailable (on a server, in a sandboxed frame, or with storage
 * blocked) it keeps entries in memory instead. Availability is checked on the
 * first read or write, never when the store is created. A failing write, such
 * as one over the storage quota, rejects with the browser's error.
 *
 * @example
 * ```ts
 * const client = createClient({
 *   connectors: [wizard()],
 *   network: "mainnet",
 *   appMetadata,
 *   storage: localStorage(),
 * });
 * ```
 *
 * @public
 */
export function localStorage(): KeyValueStore {
	let store: KeyValueStore | undefined;
	const resolve = (): KeyValueStore => {
		if (store !== undefined) return store;

		let web: Storage | null | undefined;
		try {
			web = typeof window === "undefined" ? undefined : window.localStorage;
		} catch {
			// Reading `window.localStorage` throws where storage is blocked, such as in a sandboxed frame.
		}

		store = web
			? {
					async get(key) {
						return web.getItem(key) ?? undefined;
					},
					async set(key, value) {
						web.setItem(key, value);
					},
					async delete(key) {
						web.removeItem(key);
					},
				}
			: memory();
		return store;
	};

	return {
		get(key) {
			return resolve().get(key);
		},
		set(key, value) {
			return resolve().set(key, value);
		},
		delete(key) {
			return resolve().delete(key);
		},
	};
}
