import {
	AbortedError,
	type BchConnectError,
	type BchConnectErrorCode,
	CapabilityMissingError,
	ConfigError,
	InvalidWalletResponseError,
	MethodUnsupportedError,
	NetworkMismatchError,
	RequestRejectedError,
	SessionMissingError,
	TimeoutError,
	TransportError,
} from "../../src/errors.js";

type FixtureOptions = { cause?: unknown; sessionId?: string };

/** Every error code, for table-driven tests. */
export const errorCodes: readonly BchConnectErrorCode[] = [
	"REJECTED",
	"ABORTED",
	"TIMEOUT",
	"CAPABILITY_MISSING",
	"METHOD_UNSUPPORTED",
	"SESSION_MISSING",
	"TRANSPORT",
	"INVALID_WALLET_RESPONSE",
	"NETWORK_MISMATCH",
	"CONFIG",
];

/**
 * Builds the concrete error of `code`. The switch stops compiling when a code
 * of the union has no class.
 */
export function createError(
	code: BchConnectErrorCode,
	options?: FixtureOptions,
): BchConnectError {
	switch (code) {
		case "REJECTED":
			return new RequestRejectedError("rejected", {
				by: "unknown",
				...options,
			});
		case "ABORTED":
			return new AbortedError("aborted", options);
		case "TIMEOUT":
			return new TimeoutError("timed out", options);
		case "CAPABILITY_MISSING":
			return new CapabilityMissingError("capability missing", options);
		case "METHOD_UNSUPPORTED":
			return new MethodUnsupportedError("method unsupported", options);
		case "SESSION_MISSING":
			return new SessionMissingError("session missing", options);
		case "TRANSPORT":
			return new TransportError("transport failed", options);
		case "INVALID_WALLET_RESPONSE":
			return new InvalidWalletResponseError("invalid wallet response", options);
		case "NETWORK_MISMATCH":
			return new NetworkMismatchError("network mismatch", options);
		case "CONFIG":
			return new ConfigError("bad config", options);
	}
}
