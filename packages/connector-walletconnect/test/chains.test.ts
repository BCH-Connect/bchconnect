import { describe, expect, it } from "vitest";
import { chains } from "../src/chains.js";

describe("chains", () => {
	it("should map each network to its bch chain id", () => {
		expect(chains).toEqual({
			mainnet: "bch:bitcoincash",
			chipnet: "bch:bchtest",
			regtest: "bch:bchreg",
		});
	});
});
