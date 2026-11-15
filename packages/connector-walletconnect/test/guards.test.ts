import { describe, expect, it } from "vitest";
import { isValidResult } from "../src/guards.js";

describe("isValidResult", () => {
	it.each([
		[["bchtest:qa"], true],
		[["bchtest:qa", "bchtest:qb"], true],
		[[], false],
		[[""], false],
		[["bchtest:qa", 1], false],
		[{}, false],
		["bchtest:qa", false],
	])("should accept addresses %j: %s", (value, expected) => {
		expect(isValidResult("bch_getAddresses", value)).toBe(expected);
	});

	it.each([
		[{ signedTransaction: "0200ab", signedTransactionHash: "AB12" }, true],
		[{ signedTransaction: "0200ab", signedTransactionHash: "" }, false],
		[{ signedTransaction: "0200a", signedTransactionHash: "ab12" }, false],
		[{ signedTransaction: "zz", signedTransactionHash: "ab12" }, false],
		[{ signedTransaction: "0200ab" }, false],
		[{}, false],
		[null, false],
		["0200ab", false],
	])("should accept a signed transaction %j: %s", (value, expected) => {
		expect(isValidResult("bch_signTransaction", value)).toBe(expected);
	});

	it.each([
		["H/signature==", true],
		["", false],
		[{}, false],
		[1, false],
	])("should accept a message signature %j: %s", (value, expected) => {
		expect(isValidResult("bch_signMessage", value)).toBe(expected);
	});

	it.each([[{ cancelledCount: 1 }], [null], [undefined]])(
		"should not check the answer to a custom method: %j",
		(value) => {
			expect(isValidResult("bch_cancelPendingRequests", value)).toBe(true);
		},
	);
});
