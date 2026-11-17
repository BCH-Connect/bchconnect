import { describe, expect, it } from "vitest";
import {
	isBalanceChanges,
	isBalances,
	isChain,
	isHex,
	isNonNegativeInteger,
	isStringList,
	isTransaction,
	isTransactionOutput,
} from "../src/guards.js";

const bytes = Uint8Array.of(1, 2);

const output = { lockingBytecode: bytes, valueSatoshis: 1000n };

const tokenOutput = {
	...output,
	token: {
		amount: 5n,
		category: bytes,
		nft: { capability: "minting", commitment: bytes },
	},
};

const input = {
	outpointIndex: 0,
	outpointTransactionHash: bytes,
	sequenceNumber: 0xffffffff,
	unlockingBytecode: bytes,
};

const transaction = {
	version: 2,
	locktime: 0,
	inputs: [input],
	outputs: [output, tokenOutput],
};

describe("isBalances", () => {
	it.each<[unknown, boolean]>([
		[{ sats: 0n }, true],
		[{ sats: 10n, ["ab".repeat(32)]: 5n }, true],
		[{}, false],
		[{ sats: 10 }, false],
		[{ sats: 10n, other: 5 }, false],
		[null, false],
		["10", false],
	])("should accept balances %o: %s", (value, expected) => {
		expect(isBalances(value)).toBe(expected);
	});
});

describe("isBalanceChanges", () => {
	it.each<[unknown, boolean]>([
		[{}, true],
		[{ sats: -10n }, true],
		[{ ["ab".repeat(32)]: 5n }, true],
		[{ sats: -10 }, false],
		[null, false],
		[[1n], false],
	])("should accept balance changes %o: %s", (value, expected) => {
		expect(isBalanceChanges(value)).toBe(expected);
	});
});

describe("isTransactionOutput", () => {
	it.each<[string, unknown, boolean]>([
		["a plain output", output, true],
		["a token output", tokenOutput, true],
		[
			"a token output without an NFT",
			{ ...output, token: { amount: 5n, category: bytes } },
			true,
		],
		["extra fields", { ...output, extra: "ignored" }, true],
		["a numeric value", { ...output, valueSatoshis: 1000 }, false],
		["a hex locking bytecode", { ...output, lockingBytecode: "0102" }, false],
		["a token that is not an object", { ...output, token: "token" }, false],
		[
			"an NFT that is not an object",
			{ ...output, token: { amount: 5n, category: bytes, nft: "nft" } },
			false,
		],
		[
			"a numeric token amount",
			{ ...output, token: { amount: 5, category: bytes } },
			false,
		],
		[
			"a hex token category",
			{ ...output, token: { amount: 5n, category: "0102" } },
			false,
		],
		[
			"an unknown NFT capability",
			{
				...output,
				token: {
					amount: 5n,
					category: bytes,
					nft: { capability: "burn", commitment: bytes },
				},
			},
			false,
		],
		[
			"a hex NFT commitment",
			{
				...output,
				token: {
					amount: 5n,
					category: bytes,
					nft: { capability: "none", commitment: "" },
				},
			},
			false,
		],
		["null", null, false],
	])("should accept %s: %s", (_, value, expected) => {
		expect(isTransactionOutput(value)).toBe(expected);
	});
});

describe("isTransaction", () => {
	it.each<[string, unknown, boolean]>([
		["a transaction", transaction, true],
		[
			"extra fields",
			{ ...transaction, inputs: [{ ...input, sourceOutput: {} }] },
			true,
		],
		["no inputs or outputs", { ...transaction, inputs: [], outputs: [] }, true],
		["a fractional version", { ...transaction, version: 1.5 }, false],
		["a bigint locktime", { ...transaction, locktime: 0n }, false],
		["inputs that are not a list", { ...transaction, inputs: {} }, false],
		[
			"an input that is not an object",
			{ ...transaction, inputs: [null] },
			false,
		],
		[
			"an input with a bigint index",
			{ ...transaction, inputs: [{ ...input, outpointIndex: 0n }] },
			false,
		],
		[
			"an input with a bigint sequence number",
			{ ...transaction, inputs: [{ ...input, sequenceNumber: 0n }] },
			false,
		],
		[
			"an input with a hex hash",
			{ ...transaction, inputs: [{ ...input, outpointTransactionHash: "" }] },
			false,
		],
		[
			"an input with a hex unlocking bytecode",
			{ ...transaction, inputs: [{ ...input, unlockingBytecode: "" }] },
			false,
		],
		[
			"a malformed output",
			{ ...transaction, outputs: [{ ...output, valueSatoshis: 1 }] },
			false,
		],
		["null", null, false],
	])("should accept %s: %s", (_, value, expected) => {
		expect(isTransaction(value)).toBe(expected);
	});
});

describe("isHex", () => {
	it.each<[unknown, number, boolean]>([
		["ab".repeat(32), 64, true],
		["AB".repeat(32), 64, true],
		["ab".repeat(31), 64, false],
		["zz".repeat(32), 64, false],
		[64, 64, false],
	])("should accept %o as %i hex characters: %s", (value, length, expected) => {
		expect(isHex(value, length)).toBe(expected);
	});
});

describe("isStringList", () => {
	it.each<[unknown, boolean]>([
		[[], true],
		[["a", "b"], true],
		[["a", 1], false],
		["a", false],
	])("should accept %o: %s", (value, expected) => {
		expect(isStringList(value)).toBe(expected);
	});
});

describe("isNonNegativeInteger", () => {
	it.each<[unknown, boolean]>([
		[0, true],
		[1731800000, true],
		[-1, false],
		[1.5, false],
		[Number.POSITIVE_INFINITY, false],
		[Number.NaN, false],
		["1", false],
	])("should accept %o: %s", (value, expected) => {
		expect(isNonNegativeInteger(value)).toBe(expected);
	});
});

describe("isChain", () => {
	it.each<[unknown, boolean]>([
		["bitcoincash", true],
		["bchtest", true],
		["bchreg", true],
		["chipnet", false],
		[1, false],
	])("should accept %o: %s", (value, expected) => {
		expect(isChain(value)).toBe(expected);
	});
});
