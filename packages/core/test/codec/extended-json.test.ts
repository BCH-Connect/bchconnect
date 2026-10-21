import { hexToBin, stringify } from "@bitauth/libauth";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	parseExtendedJson,
	stringifyExtendedJson,
} from "../../src/codec/extended-json.js";
import { cashNinjaJsonString0, cashNinjaJsonString1 } from "./vectors.js";

// The parser wallets run on these requests: Cashonize's parseExtendedJson
// source: https://github.com/cashonize/cashonize-wallet/blob/772ac57844381d8cf6a2e190d53efd4b6d851399/src/utils/utils.ts
// WizardConnect's wallet-side parser uses the same regexes.
function walletParse(jsonString: string): unknown {
	const uint8ArrayRegex = /^<Uint8Array: 0x(?<hex>[0-9a-f]*)>$/u;
	const bigIntRegex = /^<bigint: (?<bigint>[0-9]*)n>$/;

	return JSON.parse(jsonString, (_key, value: unknown) => {
		if (typeof value === "string") {
			const { bigint } = value.match(bigIntRegex)?.groups ?? {};
			if (bigint !== undefined) {
				return BigInt(bigint);
			}
			const { hex } = value.match(uint8ArrayRegex)?.groups ?? {};
			if (hex !== undefined) {
				return hexToBin(hex);
			}
		}
		return value;
	});
}

const plainString = fc
	.string({ unit: "binary" })
	.filter((s) => !s.startsWith("<"));
const nearTag = fc
	.tuple(
		fc.constantFrom(
			"<bigint: ",
			"<bigint:",
			"<Uint8Array: 0x",
			"<Uint8Array: ",
		),
		fc.oneof(
			fc.stringMatching(/^-?[0-9a-fA-F]*$/),
			fc.string({ unit: "binary" }),
		),
		fc.constantFrom("n>", ">", ""),
	)
	.map((parts) => parts.join(""));
// JSON writes -0 as 0, so it cannot round-trip.
const plainNumber = fc.oneof(
	fc.integer(),
	fc
		.double({ noNaN: true, noDefaultInfinity: true })
		.filter((n) => !Object.is(n, -0)),
);

function extendedValue(bigint: fc.Arbitrary<bigint>): fc.Arbitrary<unknown> {
	return fc.letrec<{ value: unknown }>((tie) => ({
		value: fc.oneof(
			{ depthSize: "small" },
			fc.constant(null),
			fc.boolean(),
			plainNumber,
			plainString,
			bigint,
			fc.uint8Array(),
			fc.array(tie("value")),
			fc.dictionary(plainString, tie("value"), { noNullPrototype: true }),
		),
	})).value;
}

const wireValue = extendedValue(fc.bigInt({ min: 0n }));
const anyValue = extendedValue(fc.bigInt());

describe("stringifyExtendedJson", () => {
	it.each([
		["a bigint", 10000n, '"<bigint: 10000n>"'],
		["zero", 0n, '"<bigint: 0n>"'],
		["a negative bigint", -5n, '"<bigint: -5n>"'],
		[
			"a bigint past 2^64",
			18446744073709551616n,
			'"<bigint: 18446744073709551616n>"',
		],
		["bytes", Uint8Array.of(0xab, 0xcd), '"<Uint8Array: 0xabcd>"'],
		["leading zero bytes", Uint8Array.of(0, 1), '"<Uint8Array: 0x0001>"'],
		["empty bytes", new Uint8Array(), '"<Uint8Array: 0x>"'],
		[
			"a view of a larger buffer",
			Uint8Array.of(1, 2, 3, 4).subarray(1, 3),
			'"<Uint8Array: 0x0203>"',
		],
		[
			"nested values",
			{
				outputs: [{ valueSatoshis: 1n, lockingBytecode: Uint8Array.of(0x6a) }],
			},
			'{"outputs":[{"valueSatoshis":"<bigint: 1n>","lockingBytecode":"<Uint8Array: 0x6a>"}]}',
		],
		["a plain string that looks like a tag", "<bigint: 1n>", '"<bigint: 1n>"'],
	])("should write %s like libauth", (_label, value, expected) => {
		expect(stringifyExtendedJson(value)).toBe(expected);
		expect(stringify(value, 0)).toBe(expected);
	});

	it("should tag a subclass of Uint8Array", () => {
		class Bytes extends Uint8Array {}

		expect(stringifyExtendedJson(Bytes.of(1, 2))).toBe(
			'"<Uint8Array: 0x0102>"',
		);
	});

	it("should leave other typed arrays as JSON.stringify writes them", () => {
		expect(stringifyExtendedJson(Uint16Array.of(1))).toBe('{"0":1}');
	});

	it("should serialize a value through its toJSON, as Buffer does", () => {
		// biome-ignore lint/style/useNamingConvention: the name JSON.stringify calls.
		const buffer = { toJSON: () => ({ type: "Buffer", data: [1, 2] }) };

		expect(stringifyExtendedJson(buffer)).toBe(
			'{"type":"Buffer","data":[1,2]}',
		);
	});

	it("should serialize an object without a prototype", () => {
		const value = Object.assign(Object.create(null), { amount: 1n });

		expect(stringifyExtendedJson(value)).toBe('{"amount":"<bigint: 1n>"}');
	});

	it("should leave out functions, symbols and undefined like JSON.stringify", () => {
		const value = {
			onSigned: (tx: string) => tx,
			kind: Symbol("kind"),
			missing: undefined,
			list: [() => 1, Symbol("x"), undefined],
		};

		expect(stringifyExtendedJson(value)).toBe('{"list":[null,null,null]}');
	});

	it.each([
		["undefined", undefined],
		["a function", () => 1],
		["a symbol", Symbol("kind")],
		// biome-ignore lint/style/useNamingConvention: the name JSON.stringify calls.
		["a value whose toJSON returns undefined", { toJSON: () => undefined }],
	])("should throw a TypeError on %s", (_label, value) => {
		expect(() => stringifyExtendedJson(value)).toThrow(
			new TypeError("The value has no JSON representation"),
		);
	});

	it("should throw a TypeError on a circular value", () => {
		const value: { self?: unknown } = {};
		value.self = value;

		expect(() => stringifyExtendedJson(value)).toThrow(TypeError);
	});

	it("should write exactly what libauth writes for any value without functions", () => {
		fc.assert(
			fc.property(anyValue, (value) => {
				expect(stringifyExtendedJson(value)).toBe(stringify(value, 0));
			}),
		);
	});
});

describe("parseExtendedJson", () => {
	it.each([
		["a bigint", '"<bigint: 10000n>"', 10000n],
		["zero", '"<bigint: 0n>"', 0n],
		["leading zeros", '"<bigint: 007n>"', 7n],
		[
			"a bigint past 2^64",
			'"<bigint: 18446744073709551616n>"',
			18446744073709551616n,
		],
		["bytes", '"<Uint8Array: 0xabcd>"', Uint8Array.of(0xab, 0xcd)],
		["empty bytes", '"<Uint8Array: 0x>"', new Uint8Array()],
	])("should read %s", (_label, text, expected) => {
		expect(parseExtendedJson(text)).toEqual(expected);
		expect(walletParse(text)).toEqual(expected);
	});

	// Wallets read the first two as 0n and as bytes ab 0c.
	it.each([
		["a bigint without digits", "<bigint: n>"],
		["odd-length hex", "<Uint8Array: 0xabc>"],
		["a negative bigint", "<bigint: -5n>"],
		["uppercase hex", "<Uint8Array: 0xABCD>"],
		["hex without the 0x prefix", "<Uint8Array: abcd>"],
		["a tag with extra spaces", "<bigint:  1n>"],
		["an unknown tag", "<Date: 2026-01-01T00:00:00.000Z>"],
		["a plain hex string", "76a914"],
		["a numeric string", "123"],
	])("should leave %s as a string", (_label, tag) => {
		expect(parseExtendedJson(JSON.stringify(tag))).toBe(tag);
	});

	// Cases from WizardConnect's serialize tests (packages/core/src/serialize.test.ts).
	it("should read the values WizardConnect relays", () => {
		expect(
			parseExtendedJson(
				'{"value":"<bigint: 200000n>","data":"<Uint8Array: 0x76a9>","name":"hello","count":"123"}',
			),
		).toEqual({
			value: 200000n,
			data: Uint8Array.of(0x76, 0xa9),
			name: "hello",
			count: "123",
		});
	});

	it("should throw a SyntaxError on text that is not JSON", () => {
		expect(() => parseExtendedJson("{")).toThrow(SyntaxError);
	});

	it.each([
		["with the transaction as hex", cashNinjaJsonString0],
		["with the transaction as an object", cashNinjaJsonString1],
	])(
		"should read a Cash-Ninja request %s as Cashonize does",
		(_label, text) => {
			const parsed = parseExtendedJson(text);

			expect(parsed).toEqual(walletParse(text));
			expect(stringifyExtendedJson(parsed)).toBe(
				JSON.stringify(JSON.parse(text)),
			);
		},
	);

	it("should read back any value it wrote with non-negative bigints", () => {
		fc.assert(
			fc.property(wireValue, (value) => {
				expect(parseExtendedJson(stringifyExtendedJson(value))).toEqual(value);
			}),
		);
	});

	it("should read what libauth writes as wallets do", () => {
		fc.assert(
			fc.property(wireValue, (value) => {
				const text = stringify(value, 0);

				expect(parseExtendedJson(text)).toEqual(walletParse(text));
			}),
		);
	});

	it("should leave a negative bigint as the string libauth wrote", () => {
		fc.assert(
			fc.property(fc.bigInt({ max: -1n }), (value) => {
				expect(parseExtendedJson(stringifyExtendedJson(value))).toBe(
					`<bigint: ${value}n>`,
				);
			}),
		);
	});

	it("should read a near-tag as wallets do, or leave it unchanged", () => {
		fc.assert(
			fc.property(nearTag, (tag) => {
				const text = JSON.stringify(tag);
				const parsed = parseExtendedJson(text);

				if (typeof parsed === "string") expect(parsed).toBe(tag);
				else expect(parsed).toEqual(walletParse(text));
			}),
		);
	});

	it("should return any string that is not a tag unchanged", () => {
		fc.assert(
			fc.property(plainString, (value) => {
				expect(parseExtendedJson(JSON.stringify(value))).toBe(value);
			}),
		);
	});
});
