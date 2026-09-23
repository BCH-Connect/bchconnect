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
 * The request was rejected by the peer. `by` records the party the protocol
 * attributes the rejection to. `remoteMessage` holds the peer's own message when one is supplied.
 *
 * @example
 * ```ts
 * throw new RequestRejectedError("User declined", {
 *   by: "user",
 *   remoteMessage: "Rejected by user",
 *   sessionId: session.id,
 * });
 * ```
 *
 * @public
 */
export class RequestRejectedError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "RequestRejectedError";
	/** Discriminant: `"REJECTED"`. */
	readonly code = "REJECTED";
	/** Who rejected, as far as the protocol can tell. */
	readonly by: "user" | "wallet" | "unknown";
	/** The peer's own message, verbatim, when one exists. */
	declare readonly remoteMessage?: string;

	/**
	 * @param message - Human-readable description.
	 * @param options - `by` (required), optional `remoteMessage`, `cause` and `sessionId`.
	 */
	constructor(
		message: string,
		options: {
			by: "user" | "wallet" | "unknown";
			remoteMessage?: string;
			cause?: unknown;
			sessionId?: string;
		},
	) {
		const { by, remoteMessage, ...rest } = options;
		super(message, rest);
		this.by = by;
		if (remoteMessage !== undefined) this.remoteMessage = remoteMessage;
	}
}

/**
 * The caller aborted via `AbortSignal` before the wallet answered.
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 * controller.abort();
 * throw new AbortedError("Aborted by caller", { cause: controller.signal.reason });
 * ```
 *
 * @public
 */
export class AbortedError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "AbortedError";
	/** Discriminant: `"ABORTED"`. */
	readonly code = "ABORTED";
}

/**
 * No answer arrived within `timeoutMs`.
 *
 * @example
 * ```ts
 * throw new TimeoutError("No answer within 30000 ms", { sessionId: session.id });
 * ```
 *
 * @public
 */
export class TimeoutError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "TimeoutError";
	/** Discriminant: `"TIMEOUT"`. */
	readonly code = "TIMEOUT";
}

/**
 * The session does not advertise a capability required by the helper that was
 * called.
 *
 * @example
 * ```ts
 * throw new CapabilityMissingError(
 *   'Session lacks "libauth-signing"',
 *   { sessionId: session.id },
 * );
 * ```
 *
 * @public
 */
export class CapabilityMissingError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "CapabilityMissingError";
	/** Discriminant: `"CAPABILITY_MISSING"`. */
	readonly code = "CAPABILITY_MISSING";
}

/**
 * The method is not advertised by this session.
 *
 * @example
 * ```ts
 * throw new MethodUnsupportedError('Method "bch_signMessage" not advertised', {
 *   sessionId: session.id,
 * });
 * ```
 *
 * @public
 */
export class MethodUnsupportedError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "MethodUnsupportedError";
	/** Discriminant: `"METHOD_UNSUPPORTED"`. */
	readonly code = "METHOD_UNSUPPORTED";
}

/**
 * No such session, or no current session.
 *
 * @example
 * ```ts
 * throw new SessionMissingError("No current session");
 * ```
 *
 * @public
 */
export class SessionMissingError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "SessionMissingError";
	/** Discriminant: `"SESSION_MISSING"`. */
	readonly code = "SESSION_MISSING";
}

/**
 * Relay or socket failure. The underlying error rides in `cause`.
 *
 * @example
 * ```ts
 * throw new TransportError("Relay connection lost", { cause: socketError });
 * ```
 *
 * @public
 */
export class TransportError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "TransportError";
	/** Discriminant: `"TRANSPORT"`. */
	readonly code = "TRANSPORT";
}

/**
 * The wallet replied with something that fails validation.
 *
 * @example
 * ```ts
 * throw new InvalidWalletResponseError("Expected signedTransaction, got {}", {
 *   sessionId: session.id,
 * });
 * ```
 *
 * @public
 */
export class InvalidWalletResponseError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "InvalidWalletResponseError";
	/** Discriminant: `"INVALID_WALLET_RESPONSE"`. */
	readonly code = "INVALID_WALLET_RESPONSE";
}

/**
 * The wallet is on a different network than the configured one.
 *
 * @example
 * ```ts
 * throw new NetworkMismatchError("Wallet is on chipnet, dapp expects mainnet");
 * ```
 *
 * @public
 */
export class NetworkMismatchError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "NetworkMismatchError";
	/** Discriminant: `"NETWORK_MISMATCH"`. */
	readonly code = "NETWORK_MISMATCH";
}

/**
 * Developer error: bad configuration or misuse of the API.
 *
 * @example
 * ```ts
 * throw new ConfigError("Duplicate protocol id: wizardconnect");
 * ```
 *
 * @public
 */
export class ConfigError extends BchConnectError {
	/** Class name, for stack traces. */
	override readonly name = "ConfigError";
	/** Discriminant: `"CONFIG"`. */
	readonly code = "CONFIG";
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
>(
	error: unknown,
	code?: C,
): error is Extract<
	| RequestRejectedError
	| AbortedError
	| TimeoutError
	| CapabilityMissingError
	| MethodUnsupportedError
	| SessionMissingError
	| TransportError
	| InvalidWalletResponseError
	| NetworkMismatchError
	| ConfigError,
	{ code: C }
> {
	return (
		typeof error === "object" &&
		error !== null &&
		brand in error &&
		error[brand] === true &&
		(code === undefined || ("code" in error && error.code === code))
	);
}
