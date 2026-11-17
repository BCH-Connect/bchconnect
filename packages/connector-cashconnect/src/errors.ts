import {
	type BchConnectError,
	ConfigError,
	InvalidWalletResponseError,
	isBchConnectError,
	RequestRejectedError,
	SessionMissingError,
	TimeoutError,
	TransportError,
} from "@bchconnect/core";
import type { SdkSchemaIssue } from "./sdk.js";

// The SDK has no error codes, so its errors are told apart by name and by
// the exact start of the messages it builds.
const TIMEOUT = "RPC execution timeout ";
const UNREADABLE_RESPONSE = "RPC response validation failed for ";
const NOT_PAIRED = "Not paired with a wallet yet - ";
const NOT_STARTED = "Dapp.start() must be called first.";
const DISCONNECTED = /^Cannot .+: WebSocket transport is disconnected\.$/;
const UNACKNOWLEDGED = "Relay timed out acknowledging event publication.";
const REFUSED = "Relay rejected event: ";
const INTERRUPTED =
	"WebSocket connection interrupted during transaction processing.";

function isRelayFailure(message: string): boolean {
	return (
		DISCONNECTED.test(message) ||
		message === UNACKNOWLEDGED ||
		message.startsWith(REFUSED) ||
		message === INTERRUPTED
	);
}

/** The `error` event a socket that failed to open rejects with. */
function isSocketEvent(reason: unknown): boolean {
	return (
		typeof reason === "object" &&
		reason !== null &&
		!(reason instanceof Error) &&
		"type" in reason &&
		reason.type === "error"
	);
}

/**
 * The error a connection or restore rejects with when the SDK fails to
 * load. An error of this library is returned as is.
 *
 * @internal
 */
export function toLoadError(reason: unknown): BchConnectError {
	if (isBchConnectError(reason)) return reason;
	return new TransportError("The CashConnect SDK failed to load", {
		cause: reason,
	});
}

/**
 * The error `connect()` rejects with when the SDK's template schema refuses
 * the template.
 *
 * @internal
 */
export function toTemplateError(reason: {
	readonly issues: readonly SdkSchemaIssue[];
}): ConfigError {
	const path = reason.issues[0]?.path.map(String).join(".") ?? "";
	return new ConfigError(
		path === ""
			? "The template is invalid"
			: `The template is invalid: ${path}`,
		{ cause: reason },
	);
}

/**
 * The error a connection or restore rejects with when the SDK's `start()`
 * fails. An error of this library is returned as is.
 *
 * @internal
 */
export function toStartError(reason: unknown): BchConnectError {
	if (isBchConnectError(reason)) return reason;
	return new TransportError(
		isSocketEvent(reason)
			? "The CashConnect relay could not be reached"
			: "The CashConnect connection could not start",
		{ cause: reason },
	);
}

/**
 * The error `connect()` rejects with when the SDK's `pair()` fails. An
 * error of this library is returned as is.
 *
 * @internal
 */
export function toPairingError(reason: unknown): BchConnectError {
	if (isBchConnectError(reason)) return reason;
	return new TransportError("The CashConnect pairing failed", {
		cause: reason,
	});
}

/**
 * The error `request()` rejects with when the SDK's request fails. A wallet
 * rejection is never attributed: declining and failing reach the dapp the
 * same way. An error of this library is returned as is.
 *
 * @internal
 */
export function toRequestError(
	reason: unknown,
	sessionId: string,
): BchConnectError {
	if (isBchConnectError(reason)) return reason;
	const options = { cause: reason, sessionId };
	if (!(reason instanceof Error)) {
		return new RequestRejectedError("The wallet declined the request", {
			...options,
			by: "unknown",
		});
	}

	const { name, message } = reason;
	if (name === "ErrorWalletRejected" || name === "RPCRemoteError") {
		// The SDK rewraps a rejected action with the wallet's text as its message.
		const remoteMessage =
			name === "ErrorWalletRejected"
				? message
				: "remoteMessage" in reason && reason.remoteMessage;
		return new RequestRejectedError("The wallet declined the request", {
			...options,
			...(typeof remoteMessage === "string" ? { remoteMessage } : {}),
			by: "unknown",
		});
	}
	if (message.startsWith(TIMEOUT)) {
		return new TimeoutError("The request expired", options);
	}
	if (message.startsWith(UNREADABLE_RESPONSE)) {
		return new InvalidWalletResponseError(
			"The wallet sent a malformed answer",
			options,
		);
	}
	if (message.startsWith(NOT_PAIRED) || message === NOT_STARTED) {
		return new SessionMissingError(
			"The CashConnect session is not connected",
			options,
		);
	}
	if (isRelayFailure(message)) {
		return new TransportError("The CashConnect relay failed", options);
	}
	return new TransportError("The CashConnect request failed", options);
}
