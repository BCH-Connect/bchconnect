import { ConfigError, InvalidWalletResponseError } from "@bchconnect/core";
import { Address, Bytes, Hasher } from "@cashconnect-js/core/primitives";
import { describe, expect, it } from "vitest";
import { fromWireReturns, toWireParams } from "../src/codec.js";
import type { SdkPrimitives } from "../src/sdk.js";
import type { CashConnectTemplate } from "../src/template.js";

// biome-ignore lint/style/useNamingConvention: SDK class names.
const sdk: SdkPrimitives = { Bytes, Address, Hasher };

const SESSION_ID = "ab".repeat(32);
const MAX_SATOSHIS = 2_100_000_000_000_000n;

const key = Address.fromHash160Bytes(new Uint8Array(20).fill(7), "P2PKH");
const testAddress = key.toCashAddr("bchtest");
const mainAddress = key.toCashAddr("bitcoincash");
const lockscript = key.toLockscriptBytes();

const leaves = {
	sats: { type: "satoshis", name: "Amount" },
	count: { type: "number", name: "Count" },
	note: { type: "string", name: "Note" },
	to: { type: "address", name: "Recipient" },
	raw: { type: "bytes", name: "Raw" },
	key: { type: "publicKey", name: "Key" },
	sig: { type: "signature", name: "Signature" },
	tx: { type: "transaction", name: "Transaction" },
	hash: { type: "transactionHash", name: "Hash" },
	choice: { type: "enum", name: "Choice" },
} as const;

const template = {
	name: "Codec",
	actions: {
		leaves: { params: leaves, instructions: [], returns: leaves },
		optional: {
			params: { memo: { type: "string", name: "Memo", required: false } },
			instructions: [],
			returns: { memo: { type: "string", name: "Memo", required: false } },
		},
		groups: {
			params: {
				pair: {
					type: "object",
					properties: {
						amount: { type: "satoshis", name: "Amount" },
						to: { type: "address", name: "Recipient" },
					},
				},
				outputs: {
					type: "array",
					properties: {
						amount: { type: "satoshis", name: "Amount" },
						to: { type: "address", name: "Recipient" },
					},
				},
			},
			instructions: [],
			returns: {
				pair: {
					type: "object",
					properties: {
						amount: { type: "satoshis", name: "Amount" },
						to: { type: "address", name: "Recipient" },
					},
				},
				outputs: {
					type: "array",
					properties: {
						amount: { type: "satoshis", name: "Amount" },
						to: { type: "address", name: "Recipient" },
					},
				},
			},
		},
	},
} as const satisfies CashConnectTemplate;

const session = {
	id: SESSION_ID,
	data: { template, chain: "bchtest" },
} as const;

const raw = Uint8Array.of(1, 2, 3);

function leafParams(overrides: Record<string, unknown> = {}) {
	return {
		sats: 1000n,
		count: -5n,
		note: "héllo",
		to: testAddress,
		raw,
		key: raw,
		sig: raw,
		tx: raw,
		hash: raw,
		choice: raw,
		...overrides,
	};
}

function vmNumber(value: bigint): Uint8Array {
	return Bytes.fromBigInt(value).toUint8Array();
}

function expectConfigError(run: () => unknown, message: string) {
	let error: unknown;
	try {
		run();
	} catch (thrown) {
		error = thrown;
	}
	expect(error).toBeInstanceOf(ConfigError);
	expect(error).toMatchObject({
		code: "CONFIG",
		message,
		sessionId: SESSION_ID,
	});
}

function expectInvalidResponse(run: () => unknown, message: string) {
	let error: unknown;
	try {
		run();
	} catch (thrown) {
		error = thrown;
	}
	expect(error).toBeInstanceOf(InvalidWalletResponseError);
	expect(error).toMatchObject({
		code: "INVALID_WALLET_RESPONSE",
		message,
		sessionId: SESSION_ID,
	});
}

describe("toWireParams", () => {
	it("should encode every leaf by its declared type with the SDK's primitives", () => {
		const wire = toWireParams(sdk, session, "leaves", leafParams());

		expect(wire).toEqual({
			sats: vmNumber(1000n),
			count: vmNumber(-5n),
			note: Bytes.fromUTF8("héllo").toUint8Array(),
			to: lockscript,
			raw,
			key: raw,
			sig: raw,
			tx: raw,
			hash: raw,
			choice: raw,
		});
	});

	it("should encode satoshis as minimal VM numbers", () => {
		const encode = (sats: bigint) => {
			const { sats: wire } = toWireParams(
				sdk,
				session,
				"leaves",
				leafParams({ sats }),
			);
			return wire;
		};

		expect(encode(0n)).toEqual(new Uint8Array());
		expect(encode(128n)).toEqual(Uint8Array.of(0x80, 0x00));
		expect(encode(546n)).toEqual(Uint8Array.of(0x22, 0x02));
		expect(encode(MAX_SATOSHIS)).toEqual(vmNumber(MAX_SATOSHIS));
	});

	it("should encode a negative number as a VM number", () => {
		const wire = toWireParams(sdk, session, "leaves", leafParams());

		expect(wire).toMatchObject({ count: Uint8Array.of(0x85) });
	});

	it("should pass every bytes-like leaf through as given", () => {
		const wire = toWireParams(sdk, session, "leaves", leafParams());

		for (const name of ["raw", "key", "sig", "tx", "hash", "choice"]) {
			expect(wire[name]).toBe(raw);
		}
	});

	it.each([
		["with the session's prefix", testAddress],
		["without a prefix", testAddress.slice("bchtest:".length)],
		["in upper case", testAddress.toUpperCase()],
		["with token support", key.toTokenAddress("bchtest")],
	])("should encode an address %s as its locking bytecode", (_, to) => {
		const wire = toWireParams(sdk, session, "leaves", leafParams({ to }));

		expect(wire).toMatchObject({ to: lockscript });
	});

	it("should encode object and array params over their properties", () => {
		const wire = toWireParams(sdk, session, "groups", {
			pair: { amount: 546n, to: testAddress },
			outputs: [
				{ amount: 1n, to: testAddress },
				{ amount: 2n, to: testAddress },
			],
		});

		expect(wire).toEqual({
			pair: { amount: vmNumber(546n), to: lockscript },
			outputs: [
				{ amount: vmNumber(1n), to: lockscript },
				{ amount: vmNumber(2n), to: lockscript },
			],
		});
	});

	it("should leave out an optional param that is absent", () => {
		expect(toWireParams(sdk, session, "optional", {})).toEqual({});
		expect(toWireParams(sdk, session, "optional", { memo: undefined })).toEqual(
			{},
		);
	});

	it("should encode an optional param that is given", () => {
		expect(toWireParams(sdk, session, "optional", { memo: "hi" })).toEqual({
			memo: Bytes.fromUTF8("hi").toUint8Array(),
		});
	});

	it("should not change the params it is given", () => {
		const params = Object.freeze({
			pair: Object.freeze({ amount: 546n, to: testAddress }),
			outputs: Object.freeze([Object.freeze({ amount: 1n, to: testAddress })]),
		});

		toWireParams(sdk, session, "groups", params);

		expect(params).toEqual({
			pair: { amount: 546n, to: testAddress },
			outputs: [{ amount: 1n, to: testAddress }],
		});
	});

	it.each(["missing", "toString"])(
		"should reject the action %j, which the template does not have",
		(action) => {
			expectConfigError(
				() => toWireParams(sdk, session, action, {}),
				`The template has no action "${action}"`,
			);
		},
	);

	it("should reject params that are not an object", () => {
		expectConfigError(
			() => toWireParams(sdk, session, "optional", "memo"),
			'Action "optional" takes its params as an object',
		);
	});

	it("should reject a missing required param", () => {
		const { sats: _, ...params } = leafParams();

		expectConfigError(
			() => toWireParams(sdk, session, "leaves", params),
			'Action "leaves" is missing param "sats"',
		);
	});

	it("should reject a param the action does not declare", () => {
		expectConfigError(
			() => toWireParams(sdk, session, "leaves", leafParams({ extra: raw })),
			'Action "leaves" has no param "extra"',
		);
	});

	it.each([
		["sats", 1000, "a bigint"],
		["count", 5, "a bigint"],
		["note", raw, "a string"],
		["to", lockscript, "a string"],
		["raw", "010203", "a Uint8Array"],
		["choice", 1n, "a Uint8Array"],
	])("should reject a %s param of the wrong type", (name, value, expected) => {
		expectConfigError(
			() => toWireParams(sdk, session, "leaves", leafParams({ [name]: value })),
			`Param "${name}" of action "leaves" must be ${expected}`,
		);
	});

	it.each([
		[
			"an object param that is not an object",
			{ pair: [], outputs: [] },
			'Param "pair" of action "groups" must be an object',
		],
		[
			"an array param that is not an array",
			{ pair: { amount: 1n, to: testAddress }, outputs: {} },
			'Param "outputs" of action "groups" must be an array',
		],
		[
			"an array item that is not an object",
			{ pair: { amount: 1n, to: testAddress }, outputs: [raw] },
			'Param "outputs[0]" of action "groups" must be an object',
		],
		[
			"a nested leaf of the wrong type",
			{
				pair: { amount: 1n, to: testAddress },
				outputs: [
					{ amount: 1n, to: testAddress },
					{ amount: 1, to: testAddress },
				],
			},
			'Param "outputs[1].amount" of action "groups" must be a bigint',
		],
		[
			"a missing nested property",
			{ pair: { to: testAddress }, outputs: [] },
			'Action "groups" is missing param "pair.amount"',
		],
		[
			"an undeclared nested property",
			{ pair: { amount: 1n, to: testAddress, extra: 1n }, outputs: [] },
			'Action "groups" has no param "pair.extra"',
		],
	])("should reject %s", (_, params, message) => {
		expectConfigError(
			() => toWireParams(sdk, session, "groups", params),
			message,
		);
	});

	it.each([-1n, MAX_SATOSHIS + 1n])(
		"should reject %i satoshis, outside the supply",
		(sats) => {
			expectConfigError(
				() => toWireParams(sdk, session, "leaves", leafParams({ sats })),
				'Param "sats" of action "leaves" is outside 0 to 21 million BCH',
			);
		},
	);

	it.each([
		["of another network", mainAddress],
		["of another network without a prefix", mainAddress.split(":")[1]],
		["in the legacy format", key.toLegacy()],
		["that is not an address", "bchtest:nope"],
	])("should reject an address %s", (_, to) => {
		expectConfigError(
			() => toWireParams(sdk, session, "leaves", leafParams({ to })),
			'Param "to" of action "leaves" is not a CashAddr for bchtest',
		);
	});

	it("should never put a param's value in the message", () => {
		const secret = "bchtest:qsecretvalue";
		let error: unknown;
		try {
			toWireParams(sdk, session, "leaves", leafParams({ to: secret }));
		} catch (thrown) {
			error = thrown;
		}

		expect(error).toBeInstanceOf(ConfigError);
		expect(String(error)).not.toContain(secret);
	});
});

describe("fromWireReturns", () => {
	it("should decode every leaf by its declared type with the SDK's primitives", () => {
		const data = fromWireReturns(sdk, session, "leaves", {
			sats: vmNumber(1000n),
			count: vmNumber(-5n),
			note: Bytes.fromUTF8("héllo").toUint8Array(),
			to: lockscript,
			raw,
			key: raw,
			sig: raw,
			tx: raw,
			hash: raw,
			choice: raw,
		});

		expect(data).toEqual(leafParams());
	});

	it("should decode an address with the session's prefix", () => {
		const mainnet = {
			...session,
			data: { ...session.data, chain: "bitcoincash" as const },
		};
		const data = fromWireReturns(sdk, mainnet, "leaves", {
			...toWireParams(sdk, session, "leaves", leafParams()),
		});

		expect(data).toMatchObject({ to: mainAddress });
	});

	it("should pass every bytes-like leaf through as received", () => {
		const data = fromWireReturns(
			sdk,
			session,
			"leaves",
			toWireParams(sdk, session, "leaves", leafParams()),
		);

		for (const name of ["raw", "key", "sig", "tx", "hash", "choice"]) {
			expect(data[name]).toBe(raw);
		}
	});

	it("should decode object and array returns over their properties", () => {
		const params = {
			pair: { amount: 546n, to: testAddress },
			outputs: [
				{ amount: 1n, to: testAddress },
				{ amount: 2n, to: testAddress },
			],
		};

		expect(
			fromWireReturns(
				sdk,
				session,
				"groups",
				toWireParams(sdk, session, "groups", params),
			),
		).toEqual(params);
	});

	it("should leave out an optional return that is absent", () => {
		expect(fromWireReturns(sdk, session, "optional", {})).toEqual({});
	});

	it("should ignore returns the action does not declare", () => {
		expect(
			fromWireReturns(sdk, session, "optional", {
				memo: Bytes.fromUTF8("hi").toUint8Array(),
				extra: raw,
			}),
		).toEqual({ memo: "hi" });
	});

	it("should reject returns that are not an object", () => {
		expectInvalidResponse(
			() => fromWireReturns(sdk, session, "optional", [raw]),
			'The wallet returned malformed data for action "optional"',
		);
	});

	it("should reject a missing required return", () => {
		const { sats: _, ...data } = toWireParams(
			sdk,
			session,
			"leaves",
			leafParams(),
		);

		expectInvalidResponse(
			() => fromWireReturns(sdk, session, "leaves", data),
			'The wallet returned no "sats" for action "leaves"',
		);
	});

	it.each([
		["a leaf that is not bytes", "sats", "03e8"],
		["a byte the SDK cannot read as a VM number", "count", Uint8Array.of(0x80)],
		["a locking bytecode with no address", "to", Uint8Array.of(0x6a)],
		[
			"a pay-to-public-key locking bytecode",
			"to",
			Uint8Array.of(0x21, ...new Uint8Array(33).fill(2), 0xac),
		],
	])("should reject %s", (_, name, value) => {
		const data = {
			...toWireParams(sdk, session, "leaves", leafParams()),
			[name]: value,
		};

		expectInvalidResponse(
			() => fromWireReturns(sdk, session, "leaves", data),
			`The wallet returned a malformed "${name}" for action "leaves"`,
		);
	});

	it.each([
		[
			"an object return that is not an object",
			{ pair: raw, outputs: [] },
			"pair",
		],
		[
			"an array return that is not an array",
			{ pair: { amount: new Uint8Array(), to: lockscript }, outputs: {} },
			"outputs",
		],
		[
			"an array item that is not an object",
			{ pair: { amount: new Uint8Array(), to: lockscript }, outputs: [raw] },
			"outputs[0]",
		],
	])("should reject %s", (_, data, name) => {
		expectInvalidResponse(
			() => fromWireReturns(sdk, session, "groups", data),
			`The wallet returned a malformed "${name}" for action "groups"`,
		);
	});
});
