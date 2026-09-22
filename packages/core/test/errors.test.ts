import { describe, expect, it } from "vitest";
import { BchConnectError, isBchConnectError } from "../src/errors.js";

class TimeoutError extends BchConnectError {
	readonly code = "TIMEOUT";
}

describe("BchConnectError", () => {
	it("should keep message, cause and sessionId", () => {
		const cause = new Error("socket closed");
		const error = new TimeoutError("timed out", { cause, sessionId: "s1" });

		expect(error.message).toBe("timed out");
		expect(error.cause).toBe(cause);
		expect(error.sessionId).toBe("s1");
		expect(error.name).toBe("BchConnectError");
	});

	it("should omit cause and sessionId when not given", () => {
		const error = new TimeoutError("timed out");

		expect("cause" in error).toBe(false);
		expect("sessionId" in error).toBe(false);
	});

	it("should keep an explicitly undefined cause", () => {
		expect("cause" in new TimeoutError("x", { cause: undefined })).toBe(true);
	});

	it("should not enumerate the brand", () => {
		const error = new TimeoutError("timed out");
		const brand = Symbol.for("@bchconnect/core/error");

		expect(Object.getOwnPropertyDescriptor(error, brand)?.enumerable).toBe(
			false,
		);
		expect(Object.getOwnPropertySymbols({ ...error })).toEqual([]);
	});
});

describe("isBchConnectError", () => {
	it("should match any code when none is given", () => {
		expect(isBchConnectError(new TimeoutError("x"))).toBe(true);
	});

	it("should match the given code only", () => {
		const error = new TimeoutError("x");

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
		const error: unknown = new TimeoutError("x");
		if (isBchConnectError(error, "TIMEOUT")) {
			const code: "TIMEOUT" = error.code;
			expect(code).toBe("TIMEOUT");
		}
	});
});
