import { AbortedError, ConfigError } from "../errors.js";
import { withTimeout } from "../internal/abort.js";

/**
 * Whether the client's `init()` has started and finished, and a signal that
 * aborts on `dispose()`. The lifecycle writes it; whatever waits on the
 * client reads it.
 *
 * @internal
 */
export interface Lifetime {
	/** Aborts when the client is disposed. */
	readonly signal: AbortSignal;
	/**
	 * Records that `init()` has started. `initialization` returns its promise,
	 * and is only called once `init()` is running.
	 */
	start(initialization: () => Promise<void>): void;
	/** Ends the lifetime: aborts {@link Lifetime.signal}. */
	end(): void;
	/**
	 * Resolves once a started `init()` resolves. Rejects `CONFIG` when
	 * `init()` never started, and `ABORTED` when the lifetime ends first.
	 */
	whenReady(method: string): Promise<void>;
}

/**
 * Creates the {@link Lifetime} of one client.
 *
 * @example
 * ```ts
 * const lifetime = createLifetime();
 * const init = once(initialize);
 * lifetime.start(init);
 * void init();
 * await lifetime.whenReady("connect");
 * ```
 *
 * @internal
 */
export function createLifetime(): Lifetime {
	const controller = new AbortController();
	let initialization: (() => Promise<void>) | undefined;

	return {
		signal: controller.signal,
		start(init) {
			initialization = init;
		},
		end() {
			controller.abort(new AbortedError("The client was disposed"));
		},
		whenReady(method) {
			if (initialization === undefined) {
				return Promise.reject(
					new ConfigError(`${method}() was called before init()`),
				);
			}
			return withTimeout(initialization, { signal: controller.signal });
		},
	};
}
