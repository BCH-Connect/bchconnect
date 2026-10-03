import { AbortedError, TimeoutError } from "../errors.js";

// The largest delay `setTimeout` honors; above it, the timer fires at once.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Whether `value` is a usable timeout: a positive, finite number of
 * milliseconds that `setTimeout` can wait for.
 *
 * @example
 * ```ts
 * isTimeoutMs(30_000); // true
 * isTimeoutMs(Number.POSITIVE_INFINITY); // false
 * ```
 *
 * @internal
 */
export function isTimeoutMs(value: unknown): value is number {
	return typeof value === "number" && value > 0 && value <= MAX_TIMEOUT_MS;
}

/**
 * A signal that aborts when any of its inputs aborts.
 *
 * @internal
 */
export interface CombinedSignal {
	/** Aborts with the reason of the first input that aborts. */
	readonly signal: AbortSignal;
	/** Stops listening to the inputs. Call it once the signal is no longer needed. */
	release(): void;
}

/**
 * Combines several signals into one that aborts as soon as any input aborts,
 * carrying that input's reason. An input that is already aborted aborts the
 * result synchronously. `undefined` inputs are skipped.
 *
 * @example
 * ```ts
 * const combined = combineSignals([callerSignal, lifetime.signal]);
 * try {
 *   await connector.connect({ signal: combined.signal });
 * } finally {
 *   combined.release();
 * }
 * ```
 *
 * @internal
 */
export function combineSignals(
	signals: readonly (AbortSignal | undefined)[],
): CombinedSignal {
	const controller = new AbortController();
	const inputs = signals.filter(
		(signal): signal is AbortSignal => signal !== undefined,
	);

	const aborted = inputs.find((input) => input.aborted);
	if (aborted !== undefined) {
		controller.abort(aborted.reason);
		return { signal: controller.signal, release: () => {} };
	}

	const removals = inputs.map((input) => {
		function onAbort() {
			release();
			controller.abort(input.reason);
		}

		input.addEventListener("abort", onAbort);
		return () => input.removeEventListener("abort", onAbort);
	});

	function release() {
		for (const remove of removals) remove();
	}

	return { signal: controller.signal, release };
}

/**
 * Runs `run` with a signal that aborts on the caller's `signal` or after
 * `timeoutMs`, and rejects as soon as either happens without waiting for
 * `run` to settle. No `timeoutMs` means no deadline.
 *
 * Rejects with `TimeoutError(timeoutMessage)` on the deadline and with
 * `AbortedError` (the caller's reason as `cause`) on the caller's signal.
 * `run` is not called when the caller's signal is already aborted.
 *
 * @example
 * ```ts
 * const session = await withTimeout(
 *   (signal) => connector.connect({ signal }),
 *   { signal: opts.signal, timeoutMs: 60_000, timeoutMessage: "connect() timed out" },
 * );
 * ```
 *
 * @internal
 */
export async function withTimeout<T>(
	run: (signal: AbortSignal) => Promise<T>,
	{
		signal,
		timeoutMs,
		timeoutMessage,
	}: { signal?: AbortSignal; timeoutMs?: number; timeoutMessage: string },
): Promise<T> {
	const deadline = new AbortController();
	const combined = combineSignals([signal, deadline.signal]);
	let timer: ReturnType<typeof setTimeout> | undefined;

	return new Promise<T>((resolve, reject) => {
		function onAbort() {
			reject(
				deadline.signal.aborted
					? deadline.signal.reason
					: new AbortedError("Aborted by caller", {
							cause: combined.signal.reason,
						}),
			);
		}

		if (combined.signal.aborted) return onAbort();
		combined.signal.addEventListener("abort", onAbort);

		if (timeoutMs !== undefined) {
			timer = setTimeout(
				() => deadline.abort(new TimeoutError(timeoutMessage)),
				timeoutMs,
			);
		}

		run(combined.signal).then(resolve, reject);
	}).finally(() => {
		clearTimeout(timer);
		combined.release();
	});
}
