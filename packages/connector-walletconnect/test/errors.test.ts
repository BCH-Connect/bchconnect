import {
	type BchConnectError,
	NetworkMismatchError,
	RequestRejectedError,
	TimeoutError,
	TransportError,
} from "@bchconnect/core";
import { describe, expect, it } from "vitest";
import { isSessionEnd, toPairingError, toRequestError } from "../src/errors.js";

function timeoutFromSdk(): Error {
	return Object.assign(new Error("Request expired"), { code: 6 });
}

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

describe("toPairingError", () => {
	it.each([5000, 5001, 5002, 5003])(
		"should map a plain %i to a rejection by an unknown party",
		(code) => {
			const reason = { code, message: "User rejected." };

			expectError(toPairingError(reason), {
				type: RequestRejectedError,
				message: "The wallet declined the connection",
				cause: reason,
				by: "unknown",
				remoteMessage: "User rejected.",
			});
		},
	);

	it("should map a plain 5100 to a network mismatch", () => {
		const reason = { code: 5100, message: "Unsupported chains." };

		expectError(toPairingError(reason), {
			type: NetworkMismatchError,
			message: "The wallet does not support the requested chain",
			cause: reason,
		});
	});

	it("should map any other plain code to a rejection by the wallet", () => {
		const reason = { code: 7, message: "Nope" };

		expectError(toPairingError(reason), {
			type: RequestRejectedError,
			message: "The wallet declined the connection",
			cause: reason,
			by: "wallet",
			remoteMessage: "Nope",
		});
	});

	it("should leave out a remote message that is not a string", () => {
		const reason = { code: 7 };

		expectError(toPairingError(reason), {
			type: RequestRejectedError,
			message: "The wallet declined the connection",
			cause: reason,
			by: "wallet",
		});
	});

	it.each([
		["an expiry error", timeoutFromSdk()],
		["a plain expired proposal", { message: "Proposal expired", code: 0 }],
	])("should map %s to a timeout", (_, reason) => {
		expectError(toPairingError(reason), {
			type: TimeoutError,
			message: "The connection proposal expired",
			cause: reason,
		});
	});

	it("should map any other error to a transport failure", () => {
		const reason = new Error("Publish failed");

		expectError(toPairingError(reason), {
			type: TransportError,
			message: "The WalletConnect relay failed",
			cause: reason,
		});
	});

	it.each([
		["a string", "boom"],
		["undefined", undefined],
		["an object without a code", { message: "x" }],
	])("should map %s to a rejection by an unknown party", (_, reason) => {
		expectError(toPairingError(reason), {
			type: RequestRejectedError,
			message: "The wallet declined the connection",
			cause: reason,
			by: "unknown",
		});
	});
});

describe("toRequestError", () => {
	it("should map a plain 5000 to a rejection by the user", () => {
		const reason = { code: 5000, message: "User rejected." };

		expectError(toRequestError(reason, "t1"), {
			type: RequestRejectedError,
			message: "The wallet declined the request",
			cause: reason,
			by: "user",
			remoteMessage: "User rejected.",
			sessionId: "t1",
		});
	});

	it.each([
		[{ code: 7, message: "Transaction signing request aborted" }],
		[{ code: -32000, message: "Wallet could not verify transaction" }],
		[{ code: 5001, message: "Other" }],
	])("should map a plain %j to a rejection by the wallet", (reason) => {
		expectError(toRequestError(reason, "t1"), {
			type: RequestRejectedError,
			message: "The wallet declined the request",
			cause: reason,
			by: "wallet",
			remoteMessage: reason.message,
			sessionId: "t1",
		});
	});

	it("should map an expiry error to a timeout", () => {
		const reason = timeoutFromSdk();

		expectError(toRequestError(reason, "t1"), {
			type: TimeoutError,
			message: "The request expired",
			cause: reason,
			sessionId: "t1",
		});
	});

	it("should map any other error to a transport failure", () => {
		const reason = new Error("Missing or invalid. request() method: x");

		expectError(toRequestError(reason, "t1"), {
			type: TransportError,
			message: "The WalletConnect relay failed",
			cause: reason,
			sessionId: "t1",
		});
	});

	it("should map a value that is neither to a rejection by an unknown party", () => {
		expectError(toRequestError(null, "t1"), {
			type: RequestRejectedError,
			message: "The wallet declined the request",
			cause: null,
			by: "unknown",
			sessionId: "t1",
		});
	});
});

describe("isSessionEnd", () => {
	it("should be true only for a plain 6000", () => {
		expect(isSessionEnd({ code: 6000, message: "User disconnected." })).toBe(
			true,
		);
		expect(isSessionEnd(Object.assign(new Error("x"), { code: 6000 }))).toBe(
			false,
		);
		expect(isSessionEnd({ code: 5000 })).toBe(false);
		expect(isSessionEnd(undefined)).toBe(false);
	});
});
