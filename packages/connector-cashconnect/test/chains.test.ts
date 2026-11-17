import { describe, expect, it } from "vitest";
import { chains } from "../src/chains.js";

describe("chains", () => {
	it("should map each network to its CashAddr prefix", () => {
		expect(chains).toEqual({
			mainnet: "bitcoincash",
			chipnet: "bchtest",
			regtest: "bchreg",
		});
	});
});
