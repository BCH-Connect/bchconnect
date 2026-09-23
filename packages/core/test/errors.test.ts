import { describe, expect, it } from "vitest";
import {
	BchConnectError,
	isBchConnectError,
	RequestRejectedError,
	TimeoutError,
} from "../src/errors.js";
import { createError, errorCodes } from "./fixtures/errors.js";

// Exercises the base class alone: a subclass that overrides nothing but `code`.
class BareError extends BchConnectError {
	readonly code = "TIMEOUT";
}

describe("BchConnectError", () => {
	it("should keep message, cause and sessionId", () => {
		const cause = new Error("socket closed");
		const error = new BareError("timed out", { cause, sessionId: "s1" });

		expect(error.message).toBe("timed out");
		expect(error.cause).toBe(cause);
		expect(error.sessionId).toBe("s1");
		expect(error.name).toBe("BchConnectError");
	});

	it("should omit cause and sessionId when not given", () => {
		const error = new BareError("timed out");

		expect("cause" in error).toBe(false);
		expect("sessionId" in error).toBe(false);
	});

	it("should keep an explicitly undefined cause", () => {
		expect("cause" in new BareError("x", { cause: undefined })).toBe(true);
	});

	it("should not enumerate the brand", () => {
		const error = new BareError("timed out");
		const brand = Symbol.for("@bchconnect/core/error");

		expect(Object.getOwnPropertyDescriptor(error, brand)?.enumerable).toBe(
			false,
		);
		expect(Object.getOwnPropertySymbols({ ...error })).toEqual([]);
	});
});

describe("isBchConnectError", () => {
	it("should match any code when none is given", () => {
		expect(isBchConnectError(new BareError("x"))).toBe(true);
	});

	it("should match the given code only", () => {
		const error = new BareError("x");

		expect(isBchConnectError(error, "TIMEOUT")).toBe(true);
		expect(isBchConnectError(error, "ABORTED")).toBe(false);
	});

	it("should match an error from another copy of the package", () => {
		const foreign = Object.assign(new Error("x"), { code: "REJECTED" });
		Object.defineProperty(foreign, Symbol.for("@bchconnect/core/error"), {
			value: true,
		});

		expect(foreign instanceof BchConnectError).toBe(false);
		expect(isBchConnectError(foreign, "REJECTED")).toBe(true);
	});

	it("should reject unbranded errors with a matching code", () => {
		const lookalike = Object.assign(new Error("x"), { code: "TIMEOUT" });

		expect(isBchConnectError(lookalike)).toBe(false);
		expect(isBchConnectError(lookalike, "TIMEOUT")).toBe(false);
	});

	it.each([null, undefined, "TIMEOUT", 42, {}])("should reject %o", (value) => {
		expect(isBchConnectError(value)).toBe(false);
	});

	it("should narrow the code", () => {
		const error: unknown = new BareError("x");
		if (isBchConnectError(error, "TIMEOUT")) {
			const code: "TIMEOUT" = error.code;
			expect(code).toBe("TIMEOUT");
		}
	});

	it("should narrow to the code's concrete class", () => {
		const error: unknown = new RequestRejectedError("declined", { by: "user" });

		if (!isBchConnectError(error, "REJECTED")) throw new Error("not narrowed");

		const by: "user" | "wallet" | "unknown" = error.by;
		expect(by).toBe("user");
	});

	it("should not widen the narrowed class", () => {
		const error: unknown = new TimeoutError("x");

		if (isBchConnectError(error, "TIMEOUT")) {
			// @ts-expect-error TIMEOUT narrows to TimeoutError, which has no `by`.
			expect(error.by).toBeUndefined();
		}
	});
});

describe("concrete errors", () => {
	it.each(errorCodes)("should expose %s as a branded error", (code) => {
		const error = createError(code);

		expect(error).toBeInstanceOf(BchConnectError);
		expect(isBchConnectError(error)).toBe(true);
		expect(error.code).toBe(code);
	});

	it.each(errorCodes)("should name %s after its class", (code) => {
		const error = createError(code);

		expect(error.name).toBe(error.constructor.name);
	});

	it.each(errorCodes)("should keep the underlying cause of %s", (code) => {
		const cause = new Error("sdk failure");

		expect(createError(code, { cause }).cause).toBe(cause);
	});

	it.each(errorCodes)("should keep the involved session of %s", (code) => {
		expect(createError(code, { sessionId: "s1" }).sessionId).toBe("s1");
	});

	it.each(errorCodes)("should omit an unset cause for %s", (code) => {
		expect("cause" in createError(code)).toBe(false);
	});
});

describe("RequestRejectedError", () => {
	it("should keep by and remoteMessage", () => {
		const error = new RequestRejectedError("declined", {
			by: "user",
			remoteMessage: "Rejected by user",
		});

		expect(error.code).toBe("REJECTED");
		expect(error.by).toBe("user");
		expect(error.remoteMessage).toBe("Rejected by user");
	});

	it("should omit remoteMessage when not given", () => {
		const error = new RequestRejectedError("declined", { by: "unknown" });

		expect("remoteMessage" in error).toBe(false);
	});
});
