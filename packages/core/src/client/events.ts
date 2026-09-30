import type { LifecycleEvents } from "../types/client.js";
import type { Logger } from "../types/protocol.js";

/**
 * Registry and dispatcher for the client's lifecycle events.
 *
 * @internal
 */
export interface LifecycleEmitter {
	/**
	 * Calls `listener` on every `event`. Returns unsubscribe, which removes
	 * only this registration.
	 */
	on<E extends keyof LifecycleEvents>(
		event: E,
		listener: (payload: LifecycleEvents[E]) => void,
	): () => void;
	/** Calls every listener of `event`, in subscription order. */
	emit<E extends keyof LifecycleEvents>(
		event: E,
		payload: LifecycleEvents[E],
	): void;
	/** Removes every listener. */
	clear(): void;
}

// One entry per `on()` call, so unsubscribing removes only that call's
// registration even when the same function is subscribed more than once.
type ListenerMap = {
	[E in keyof LifecycleEvents]: Set<{
		listener: (payload: LifecycleEvents[E]) => void;
	}>;
};

/**
 * Creates a {@link LifecycleEmitter}.
 *
 * Listeners run synchronously. A listener that throws is reported to
 * `logger.error` and the remaining listeners still run.
 *
 * @example
 * ```ts
 * const events = createEmitter(logger);
 * const off = events.on("session:disconnected", ({ sessionId }) => {
 *   console.log(sessionId);
 * });
 *
 * events.emit("session:disconnected", { sessionId: "a", reason: "user" });
 * off();
 * ```
 *
 * @internal
 */
export function createEmitter(logger: Logger): LifecycleEmitter {
	const listeners: ListenerMap = {
		"session:connected": new Set(),
		"session:changed": new Set(),
		"session:disconnected": new Set(),
		"request:pending": new Set(),
		"request:settled": new Set(),
		"client:error": new Set(),
	};

	return {
		on(event, listener) {
			const registered = listeners[event];
			const entry = { listener };
			registered.add(entry);
			return () => {
				registered.delete(entry);
			};
		},
		emit(event, payload) {
			const registered = listeners[event];
			// A copy, so that subscribing during an emit never grows the loop.
			// `has` skips listeners that unsubscribed inside it.
			for (const entry of [...registered]) {
				if (!registered.has(entry)) continue;
				try {
					entry.listener(payload);
				} catch (error) {
					logger.error(`A "${event}" listener threw`, error);
				}
			}
		},
		clear() {
			for (const registered of Object.values(listeners)) registered.clear();
		},
	};
}
