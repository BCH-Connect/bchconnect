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
	/** Calls `listener` once per state transition. Returns unsubscribe. */
	subscribe(listener: () => void): () => void;
}

/**
 * Creates a {@link Store} holding `initial`.
 *
 * Listeners run synchronously, in subscription order, once per transition.
 * A listener that throws stops the notification.
 *
 * @example
 * ```ts
 * const store = createStore({ count: 0 });
 * const unsubscribe = store.subscribe(() => console.log(store.getState()));
 *
 * store.setState((previous) => ({ count: previous.count + 1 }));
 * unsubscribe();
 * ```
 *
 * @internal
 */
export function createStore<T>(initial: T): Store<T> {
	let state = initial;
	const listeners = new Set<() => void>();

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
			for (const listener of [...listeners]) {
				if (listeners.has(listener)) listener();
			}
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
