import type { Logger } from "./types/protocol.js";

/**
 * External store. It's the single source of truth behind a client.
 *
 * @internal
 */
export interface Store<T> {
	/** Returns the current state. */
	getState(): T;
	/**
	 * Replaces the state with `update(current)`. Returning the current state
	 * unchanged notifies nobody.
	 */
	setState(update: (previous: T) => T): void;
	/**
	 * Calls `listener` on every state transition, once for each time it is
	 * subscribed. Returns unsubscribe, which removes only this registration.
	 */
	subscribe(listener: () => void): () => void;
}

/**
 * Creates a {@link Store} holding `initial`.
 *
 * Listeners run synchronously, in subscription order, once per registration
 * and transition. A listener that throws is reported to `logger.error` and
 * the remaining listeners still run.
 *
 * @example
 * ```ts
 * const store = createStore({ count: 0 }, logger);
 * const unsubscribe = store.subscribe(() => console.log(store.getState()));
 *
 * store.setState((previous) => ({ count: previous.count + 1 }));
 * unsubscribe();
 * ```
 *
 * @internal
 */
export function createStore<T>(initial: T, logger: Logger): Store<T> {
	let state = initial;
	// One entry per `subscribe()` call, so unsubscribing removes only that
	// call's registration even when the same function is subscribed more
	// than once.
	const listeners = new Set<{ listener: () => void }>();

	return {
		getState() {
			return state;
		},
		setState(update) {
			const next = update(state);
			if (Object.is(next, state)) return;

			state = next;
			// A copy, so that subscribing during a notification never grows the
			// loop; `has` skips listeners that unsubscribed inside it.
			for (const entry of [...listeners]) {
				if (!listeners.has(entry)) continue;
				try {
					entry.listener();
				} catch (error) {
					logger.error("A store listener threw", error);
				}
			}
		},
		subscribe(listener) {
			const entry = { listener };
			listeners.add(entry);
			return () => {
				listeners.delete(entry);
			};
		},
	};
}
