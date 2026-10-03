import { TransportError } from "../errors.js";
import { SNAPSHOT_KEY, serializeSnapshot, toSnapshot } from "../snapshot.js";
import type { ClientSnapshot } from "../types/client.js";
import type { ClientRuntime } from "./runtime.js";

/**
 * Keeps the client snapshot in client-tier storage in step with the store.
 *
 * @internal
 */
export interface Persistence {
	/**
	 * Starts writing, taking `reference` as what storage already holds.
	 * Nothing is written before this call.
	 */
	start(reference: ClientSnapshot | undefined): void;
	/** Stops writing and resolves once the writes already queued have landed. */
	stop(): Promise<void>;
}

/**
 * Creates the {@link Persistence} of one client. Subscribing to the store is
 * the only work done here. Nothing is written until `start()`.
 *
 * @example
 * ```ts
 * const persistence = createPersistence(runtime);
 * persistence.start(await readSnapshot());
 * ```
 *
 * @internal
 */
export function createPersistence(runtime: ClientRuntime): Persistence {
	const { store } = runtime;
	let started = false;
	// What storage holds: a snapshot, `undefined` for none, `null` for unknown
	// after a failed write, so the next notification writes again.
	let persisted: string | undefined | null;
	let writes = Promise.resolve();

	// Runs inside store notifications, so it must never throw: failures
	// surface asynchronously through the write chain.
	function persist() {
		if (!started) return;

		const state = store.getState();
		const value =
			state.sessions.size === 0
				? undefined
				: serializeSnapshot(toSnapshot(state, runtime.network));
		if (value === persisted) return;

		persisted = value;
		writes = writes
			.then(() =>
				value === undefined
					? runtime.clientStorage.delete(SNAPSHOT_KEY)
					: runtime.clientStorage.set(SNAPSHOT_KEY, value),
			)
			.catch((error: unknown) => {
				persisted = null;
				runtime.reportError(
					error,
					(cause) =>
						new TransportError("Writing the client snapshot failed", {
							cause,
						}),
				);
			});
	}

	const unsubscribe = store.subscribe(persist);

	return {
		start(reference) {
			persisted = reference && serializeSnapshot(reference);
			started = true;
		},
		stop() {
			unsubscribe();
			return writes;
		},
	};
}
