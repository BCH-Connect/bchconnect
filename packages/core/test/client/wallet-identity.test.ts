import { demoSession } from "@bchconnect/test-utils";
import { describe, expect, it } from "vitest";
import {
	keepWalletIdentity,
	mergeWalletIdentity,
} from "../../src/client/wallet-identity.js";

describe("mergeWalletIdentity", () => {
	it("should return the same session when there is no selection", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		expect(mergeWalletIdentity(session)).toBe(session);
	});

	it("should return the same session when the selection is empty", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		expect(mergeWalletIdentity(session, {})).toBe(session);
	});

	it("should return the same session when the selection fills no gap", () => {
		const session = demoSession({
			wallet: { icon: "https://example.com/paytaca.svg", source: "protocol" },
		});

		expect(
			mergeWalletIdentity(session, {
				icon: "https://example.com/cashonize.svg",
			}),
		).toBe(session);
	});

	it("should fill every missing field from the selection", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const merged = mergeWalletIdentity(session, {
			id: "cashonize",
			name: "Cashonize",
			icon: "https://example.com/cashonize.svg",
		});

		expect(merged.wallet).toStrictEqual({
			id: "cashonize",
			name: "Cashonize",
			icon: "https://example.com/cashonize.svg",
			source: "selection",
		});
	});

	it("should keep the fields the protocol supplied", () => {
		const session = demoSession({
			wallet: {
				id: "paytaca",
				name: "Paytaca",
				icon: "https://example.com/paytaca.svg",
				source: "protocol",
			},
		});

		const merged = mergeWalletIdentity(session, {
			id: "cashonize",
			name: "Cashonize",
			icon: "https://example.com/cashonize.svg",
		});

		expect(merged.wallet).toStrictEqual({
			id: "paytaca",
			name: "Paytaca",
			icon: "https://example.com/paytaca.svg",
			source: "protocol",
		});
	});

	it("should combine protocol fields with selection fields", () => {
		const session = demoSession({
			wallet: { icon: "https://example.com/paytaca.svg", source: "protocol" },
		});

		const merged = mergeWalletIdentity(session, {
			id: "paytaca",
			name: "Paytaca",
		});

		expect(merged.wallet).toStrictEqual({
			id: "paytaca",
			name: "Paytaca",
			icon: "https://example.com/paytaca.svg",
			source: "selection",
		});
	});

	it("should mark the protocol as the source when it supplied a name", () => {
		const session = demoSession({
			wallet: { name: "Paytaca", source: "protocol" },
		});

		const merged = mergeWalletIdentity(session, {
			id: "paytaca",
			icon: "https://example.com/paytaca.svg",
		});

		expect(merged.wallet.source).toBe("protocol");
	});

	it("should mark the selection as the source when the protocol supplied no name", () => {
		const session = demoSession({
			wallet: { id: "paytaca", source: "protocol" },
		});

		const merged = mergeWalletIdentity(session, { name: "Paytaca" });

		expect(merged.wallet.source).toBe("selection");
	});

	it("should mark the selection as the source when neither side supplied a name", () => {
		const session = demoSession({
			wallet: { icon: "https://example.com/paytaca.svg", source: "protocol" },
		});

		const merged = mergeWalletIdentity(session, { id: "paytaca" });

		expect(merged.wallet).toStrictEqual({
			id: "paytaca",
			icon: "https://example.com/paytaca.svg",
			source: "selection",
		});
	});

	it("should leave out fields that neither side supplied", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const merged = mergeWalletIdentity(session, {
			icon: "https://example.com/cashonize.svg",
		});

		expect(merged.wallet).toStrictEqual({
			icon: "https://example.com/cashonize.svg",
			source: "selection",
		});
	});

	it("should keep every other field of the session", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const merged = mergeWalletIdentity(session, { name: "Cashonize" });

		expect(merged).not.toBe(session);
		expect(merged.id).toBe(session.id);
		expect(merged.protocol).toBe(session.protocol);
		expect(merged.data).toBe(session.data);
		expect(merged.status).toBe(session.status);
	});

	it("should never mutate the session it merges into", () => {
		const session = demoSession({
			wallet: { icon: "https://example.com/paytaca.svg", source: "protocol" },
		});
		const wallet = session.wallet;
		const before = structuredClone(session);

		mergeWalletIdentity(session, { id: "paytaca", name: "Paytaca" });

		expect(session).toStrictEqual(before);
		expect(session.wallet).toBe(wallet);
	});
});

describe("keepWalletIdentity", () => {
	it("should fill the fields the newer snapshot left out", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const kept = keepWalletIdentity(session, {
			id: "cashonize",
			name: "Cashonize",
			source: "selection",
		});

		expect(kept.wallet).toStrictEqual({
			id: "cashonize",
			name: "Cashonize",
			source: "selection",
		});
	});

	it("should let the newer snapshot's name win and mark it as the protocol's", () => {
		const session = demoSession({
			wallet: { name: "Paytaca", source: "protocol" },
		});

		const kept = keepWalletIdentity(session, {
			id: "cashonize",
			name: "Cashonize",
			source: "selection",
		});

		expect(kept.wallet).toStrictEqual({
			id: "cashonize",
			name: "Paytaca",
			source: "protocol",
		});
	});

	it("should keep the earlier source of a name the newer snapshot left out", () => {
		const session = demoSession({ wallet: { source: "protocol" } });

		const kept = keepWalletIdentity(session, {
			name: "Paytaca",
			source: "protocol",
		});

		expect(kept.wallet).toStrictEqual({ name: "Paytaca", source: "protocol" });
	});

	it("should return the same session when nothing is filled", () => {
		const session = demoSession({
			wallet: { name: "Paytaca", source: "protocol" },
		});

		expect(keepWalletIdentity(session, { source: "selection" })).toBe(session);
	});
});
