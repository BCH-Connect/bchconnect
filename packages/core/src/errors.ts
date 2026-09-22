/**
 * Machine-readable discriminant of every error surfaced by BCH Connect.
 *
 * @public
 */
export type BchConnectErrorCode =
	| "REJECTED"
	| "ABORTED"
	| "TIMEOUT"
	| "CAPABILITY_MISSING"
	| "METHOD_UNSUPPORTED"
	| "SESSION_MISSING"
	| "TRANSPORT"
	| "INVALID_WALLET_RESPONSE"
	| "NETWORK_MISMATCH"
	| "CONFIG";

// Identifies errors across duplicate copies of this package, where `instanceof` fails.
const brand: unique symbol = Symbol.for("@bchconnect/core/error");

/**
 * Base class of every error surfaced by BCH Connect.
 *
 * Prefer {@link isBchConnectError} over `instanceof`: it also works when more
 * than one copy of this package is loaded (ESM and CJS builds, or two
 * installed versions), where `instanceof` returns false.
 *
 * @example
 * ```ts
 * try {
 *   await client.connect("wizardconnect");
 * } catch (error) {
 *   if (isBchConnectError(error, "ABORTED")) return;
 *   throw error;
 * }
 * ```
 *
 * @public
 */
export abstract class BchConnectError extends Error {
	/** Machine-readable discriminant. */
	abstract readonly code: BchConnectErrorCode;
	/** The session involved, when applicable. */
	declare readonly sessionId?: string;

	/**
	 * @param message - Human-readable description.
	 * @param options - Underlying `cause` and the involved `sessionId`.
	 */
	constructor(
		message: string,
		options: { cause?: unknown; sessionId?: string } = {},
	) {
		super(message, "cause" in options ? { cause: options.cause } : undefined);
		this.name = "BchConnectError";
		if (options.sessionId !== undefined) this.sessionId = options.sessionId;
		Object.defineProperty(this, brand, { value: true });
	}
}

/**
 * Returns true when `error` is a {@link BchConnectError}, optionally with the
 * given `code`. Works across duplicate copies of this package.
 *
 * @example
 * ```ts
 * if (isBchConnectError(error, "REJECTED")) {
 *   showToast("Declined in wallet");
 * }
 * ```
 *
 * @public
 */
export function isBchConnectError<
	C extends BchConnectErrorCode = BchConnectErrorCode,
>(error: unknown, code?: C): error is BchConnectError & { readonly code: C } {
	return (
		typeof error === "object" &&
		error !== null &&
		brand in error &&
		error[brand] === true &&
		(code === undefined || ("code" in error && error.code === code))
	);
}
