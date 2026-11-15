import {
	InvalidWalletResponseError,
	NetworkMismatchError,
} from "@bchconnect/core";
import { describe, expect, it } from "vitest";
import { parseData, parseWallet, toSession } from "../src/session.js";
import {
	address,
	proposedMethods,
	sdkSession,
} from "./fixtures/sign-client.js";

describe("parseData", () => {
	it("should read the chain's addresses without the namespace, and the methods", () => {
		const { namespaces } = sdkSession({
			accounts: [`bch:${address}`, "bch:bchtest:qsecond"],
		});

		expect(parseData(namespaces, "bch:bchtest")).toEqual({
			data: {
				chain: "bch:bchtest",
				addresses: [address, "bchtest:qsecond"],
				methods: proposedMethods,
			},
		});
	});

	it("should ignore accounts on other chains and malformed accounts", () => {
		const { namespaces } = sdkSession({
			accounts: ["bch:bitcoincash:qmain", 42, "bch:bchtest:", `bch:${address}`],
		});

		expect(parseData(namespaces, "bch:bchtest")).toEqual({
			data: {
				chain: "bch:bchtest",
				addresses: [address],
				methods: proposedMethods,
			},
		});
	});

	it("should accept a session without any signing method", () => {
		const { namespaces } = sdkSession({ methods: [] });

		expect(parseData(namespaces, "bch:bchtest")).toEqual({
			data: { chain: "bch:bchtest", addresses: [address], methods: [] },
		});
	});

	it("should report a network mismatch when only other bch chains have accounts", () => {
		const { namespaces } = sdkSession({ accounts: ["bch:bitcoincash:qmain"] });

		const result = parseData(namespaces, "bch:bchtest");

		expect(result).toEqual({ error: expect.any(NetworkMismatchError) });
		expect("error" in result && result.error.message).toBe(
			"The wallet approved no account on bch:bchtest",
		);
	});

	it.each([
		["no bch namespace", {}],
		["a bch namespace that is not an object", { bch: "x" }],
		["accounts that are not a list", { bch: { accounts: "x", methods: [] } }],
		["no account at all", { bch: { accounts: [], methods: [] } }],
		[
			"only malformed accounts",
			{ bch: { accounts: ["nope", 1], methods: [] } },
		],
		[
			"methods that are not strings",
			{ bch: { accounts: [`bch:${address}`], methods: [1] } },
		],
		["no methods", { bch: { accounts: [`bch:${address}`] } }],
	])("should reject %s as an invalid wallet response", (_, namespaces) => {
		const result = parseData(namespaces, "bch:bchtest");

		expect(result).toEqual({ error: expect.any(InvalidWalletResponseError) });
		expect("error" in result && result.error.message).toBe(
			"The wallet approved no usable bch namespace",
		);
	});

	it("should reject namespaces that are not an object", () => {
		expect(parseData(null, "bch:bchtest")).toEqual({
			error: expect.any(InvalidWalletResponseError),
		});
	});
});

describe("parseWallet", () => {
	it("should take the name and first icon from the protocol", () => {
		expect(
			parseWallet({ name: "Selene", icons: ["https://a/icon.png", "b"] }),
		).toEqual({
			name: "Selene",
			icon: "https://a/icon.png",
			source: "protocol",
		});
	});

	it("should leave out an icon that is not a non-empty string", () => {
		expect(parseWallet({ name: "Selene", icons: [""] })).toEqual({
			name: "Selene",
			source: "protocol",
		});
		expect(parseWallet({ name: "Selene", icons: "x" })).toEqual({
			name: "Selene",
			source: "protocol",
		});
	});

	it("should fall back to the selection without a name", () => {
		expect(parseWallet({ name: "", icons: ["https://a/icon.png"] })).toEqual({
			source: "selection",
		});
		expect(parseWallet({})).toEqual({ source: "selection" });
	});
});

describe("toSession", () => {
	it("should build a session keyed by topic with the given transport", () => {
		const raw = sdkSession({ topic: "t1" });

		expect(toSession(raw, "bch:bchtest", false)).toEqual({
			session: {
				id: "t1",
				protocol: "bch-wc2",
				wallet: {
					name: "Cashonize",
					icon: "https://cashonize.com/icon.png",
					source: "protocol",
				},
				data: {
					chain: "bch:bchtest",
					addresses: [address],
					methods: proposedMethods,
				},
				status: { transport: "reconnecting", peer: "unknown" },
			},
		});
	});

	it("should pass on a validation error", () => {
		const raw = sdkSession({ accounts: [] });

		expect(toSession(raw, "bch:bchtest", true)).toEqual({
			error: expect.any(InvalidWalletResponseError),
		});
	});
});
