import {
	AbortedError,
	type BchConnectError,
	ConfigError,
	InvalidWalletResponseError,
	RequestRejectedError,
	SessionMissingError,
	TimeoutError,
	TransportError,
} from "@bchconnect/core";
import { RPCRemoteError } from "@cashconnect-js/nostr";
import {
	ErrorUserRejected,
	ErrorWalletRejected,
} from "@cashconnect-js/nostr/dapp";
import { describe, expect, it } from "vitest";
import {
	toLoadError,
	toPairingError,
	toRequestError,
	toStartError,
	toTemplateError,
} from "../src/errors.js";

const SESSION = "ab".repeat(32);

function expectError(
	error: BchConnectError,
	expected: {
		type: abstract new (...args: never[]) => BchConnectError;
		message: string;
		cause: unknown;
		by?: string;
		remoteMessage?: string;
		sessionId?: string;
	},
) {
	expect(error).toBeInstanceOf(expected.type);
	expect(error.message).toBe(expected.message);
	expect(error.cause).toBe(expected.cause);
	expect(error.sessionId).toBe(expected.sessionId);
	if (error instanceof RequestRejectedError) {
		expect(error.by).toBe(expected.by);
		expect(error.remoteMessage).toBe(expected.remoteMessage);
	} else {
		expect(expected.by).toBeUndefined();
	}
}

describe("toLoadError", () => {
	it("should map a failed import to a transport error", () => {
		const reason = new TypeError("Failed to fetch dynamically imported module");

		expectError(toLoadError(reason), {
			type: TransportError,
			message: "The CashConnect SDK failed to load",
			cause: reason,
		});
	});

	it("should return an error of this library as is", () => {
		const reason = new AbortedError("Aborted");

		expect(toLoadError(reason)).toBe(reason);
	});
});

describe("toTemplateError", () => {
	it("should name the path of the first issue", () => {
		const reason = {
			issues: [
				{ path: ["actions", "send", "instructions", 0, "type"] },
				{ path: ["name"] },
			],
		};

		expectError(toTemplateError(reason), {
			type: ConfigError,
			message: "The template is invalid: actions.send.instructions.0.type",
			cause: reason,
		});
	});

	it.each([
		["the issue is at the root", { issues: [{ path: [] }] }],
		["there is no issue", { issues: [] }],
	])("should leave the path out when %s", (_, reason) => {
		expectError(toTemplateError(reason), {
			type: ConfigError,
			message: "The template is invalid",
			cause: reason,
		});
	});
});

describe("toStartError", () => {
	it("should map the socket's error event to an unreachable relay", () => {
		const reason = new Event("error");

		expectError(toStartError(reason), {
			type: TransportError,
			message: "The CashConnect relay could not be reached",
			cause: reason,
		});
	});

	it.each([
		["an error", new Error("Storage is unavailable")],
		["a value that is not an error", "nope"],
	])("should map %s to a failed start", (_, reason) => {
		expectError(toStartError(reason), {
			type: TransportError,
			message: "The CashConnect connection could not start",
			cause: reason,
		});
	});

	it("should return an error of this library as is", () => {
		const reason = new TimeoutError("Timed out");

		expect(toStartError(reason)).toBe(reason);
	});
});

describe("toPairingError", () => {
	it.each([
		["an error", new Error("Dapp.start() must be called first.")],
		["a value that is not an error", undefined],
	])("should map %s to a failed pairing", (_, reason) => {
		expectError(toPairingError(reason), {
			type: TransportError,
			message: "The CashConnect pairing failed",
			cause: reason,
		});
	});

	it("should return an error of this library as is", () => {
		const reason = new AbortedError("Aborted");

		expect(toPairingError(reason)).toBe(reason);
	});
});

describe("toRequestError", () => {
	it("should map the wallet's rejection of an action, keeping its message", () => {
		const reason = new ErrorWalletRejected("User cancelled");

		expectError(toRequestError(reason, SESSION), {
			type: RequestRejectedError,
			message: "The wallet declined the request",
			cause: reason,
			by: "unknown",
			remoteMessage: "User cancelled",
			sessionId: SESSION,
		});
	});

	it("should map the wallet's rejection of a read, keeping its message", () => {
		const reason = new RPCRemoteError("getBalances", "Wallet is locked");

		expectError(toRequestError(reason, SESSION), {
			type: RequestRejectedError,
			message: "The wallet declined the request",
			cause: reason,
			by: "unknown",
			remoteMessage: "Wallet is locked",
			sessionId: SESSION,
		});
	});

	it("should leave out a remote message that is not a string", () => {
		const reason = Object.assign(new Error("Failed"), {
			name: "RPCRemoteError",
			remoteMessage: 1,
		});

		expectError(toRequestError(reason, SESSION), {
			type: RequestRejectedError,
			message: "The wallet declined the request",
			cause: reason,
			by: "unknown",
			sessionId: SESSION,
		});
	});

	it("should map an expired request to a timeout", () => {
		const reason = new Error(
			"RPC execution timeout [Method: executeAction | ID: k3j4h5]",
		);

		expectError(toRequestError(reason, SESSION), {
			type: TimeoutError,
			message: "The request expired",
			cause: reason,
			sessionId: SESSION,
		});
	});

	it("should map a response the SDK could not validate to an invalid answer", () => {
		const reason = new Error(
			"RPC response validation failed for getBalances: Invalid input",
		);

		expectError(toRequestError(reason, SESSION), {
			type: InvalidWalletResponseError,
			message: "The wallet sent a malformed answer",
			cause: reason,
			sessionId: SESSION,
		});
	});

	it.each([
		"Not paired with a wallet yet - call start() then pair() first.",
		"Dapp.start() must be called first.",
	])("should map %j to a missing session", (message) => {
		const reason = new Error(message);

		expectError(toRequestError(reason, SESSION), {
			type: SessionMissingError,
			message: "The CashConnect session is not connected",
			cause: reason,
			sessionId: SESSION,
		});
	});

	it.each([
		"Cannot publish: WebSocket transport is disconnected.",
		"Cannot send a subscription request: WebSocket transport is disconnected.",
		"Relay timed out acknowledging event publication.",
		"Relay rejected event: rate-limited",
		"WebSocket connection interrupted during transaction processing.",
	])("should map %j to a relay failure", (message) => {
		const reason = new Error(message);

		expectError(toRequestError(reason, SESSION), {
			type: TransportError,
			message: "The CashConnect relay failed",
			cause: reason,
			sessionId: SESSION,
		});
	});

	it.each([
		["the SDK's own cancellation", new ErrorUserRejected()],
		["a schema error", Object.assign(new Error("[]"), { name: "ZodError" })],
		["any other error", new Error("Something broke")],
	])("should map %s to a failed request", (_, reason) => {
		expectError(toRequestError(reason, SESSION), {
			type: TransportError,
			message: "The CashConnect request failed",
			cause: reason,
			sessionId: SESSION,
		});
	});

	it("should map a value that is not an error to a rejection by an unknown party", () => {
		const reason = { message: "nope" };

		expectError(toRequestError(reason, SESSION), {
			type: RequestRejectedError,
			message: "The wallet declined the request",
			cause: reason,
			by: "unknown",
			sessionId: SESSION,
		});
	});

	it("should return an error of this library as is", () => {
		const reason = new AbortedError("Aborted");

		expect(toRequestError(reason, SESSION)).toBe(reason);
	});
});
