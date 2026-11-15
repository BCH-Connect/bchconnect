import {
	type BchConnectError,
	NetworkMismatchError,
	RequestRejectedError,
	TimeoutError,
	TransportError,
} from "@bchconnect/core";

// The SDK's code for an expired proposal or request.
const EXPIRED = 6;
// The wallet ended the session while the request was pending.
const SESSION_ENDED = 6000;
const UNSUPPORTED_CHAINS = 5100;

interface CodedRejection {
	readonly code: number;
	readonly message?: unknown;
}

/** A wallet's JSON-RPC error, which the SDK passes on as a plain object. */
function isCodedRejection(reason: unknown): reason is CodedRejection {
	return (
		typeof reason === "object" &&
		reason !== null &&
		!(reason instanceof Error) &&
		"code" in reason &&
		typeof reason.code === "number"
	);
}

function isExpiry(reason: unknown): boolean {
	return (
		(reason instanceof Error && "code" in reason && reason.code === EXPIRED) ||
		(isCodedRejection(reason) && reason.message === "Proposal expired")
	);
}

function toRemoteMessage(reason: CodedRejection): { remoteMessage?: string } {
	return typeof reason.message === "string"
		? { remoteMessage: reason.message }
		: {};
}

/**
 * Who a coded rejection is attributed to. At pairing, a decline does not
 * prove a person declined: Selene sends one by itself, with no prompt, when
 * the proposal is for a network its wallet is not on.
 */
function attributeRejection(
	code: number,
	stage: "pairing" | "request",
): "user" | "wallet" | "unknown" {
	if (stage === "pairing")
		return code >= 5000 && code <= 5003 ? "unknown" : "wallet";
	return code === 5000 ? "user" : "wallet";
}

/** The error `connect()` rejects with when the SDK's proposal fails. */
export function toPairingError(reason: unknown): BchConnectError {
	const options = { cause: reason };
	if (isExpiry(reason)) {
		return new TimeoutError("The connection proposal expired", options);
	}
	if (reason instanceof Error) {
		return new TransportError("The WalletConnect relay failed", options);
	}
	if (!isCodedRejection(reason)) {
		return new RequestRejectedError("The wallet declined the connection", {
			...options,
			by: "unknown",
		});
	}
	if (reason.code === UNSUPPORTED_CHAINS) {
		return new NetworkMismatchError(
			"The wallet does not support the requested chain",
			options,
		);
	}
	return new RequestRejectedError("The wallet declined the connection", {
		...options,
		...toRemoteMessage(reason),
		by: attributeRejection(reason.code, "pairing"),
	});
}

/** The error `request()` rejects with when the SDK's request fails. */
export function toRequestError(
	reason: unknown,
	sessionId: string,
): BchConnectError {
	const options = { cause: reason, sessionId };
	if (isExpiry(reason)) {
		return new TimeoutError("The request expired", options);
	}
	if (reason instanceof Error) {
		return new TransportError("The WalletConnect relay failed", options);
	}
	return new RequestRejectedError("The wallet declined the request", {
		...options,
		...(isCodedRejection(reason) ? toRemoteMessage(reason) : {}),
		by: isCodedRejection(reason)
			? attributeRejection(reason.code, "request")
			: "unknown",
	});
}

/** Whether a request failed because the wallet ended the session. */
export function isSessionEnd(reason: unknown): boolean {
	return isCodedRejection(reason) && reason.code === SESSION_ENDED;
}
