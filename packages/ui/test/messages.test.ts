import { describe, expect, it } from "vitest";
import {
	BCHC_MESSAGES_EN,
	type BchcMessages,
	mergeMessages,
} from "../src/messages.ts";

describe("mergeMessages", () => {
	it("returns English when nothing is overridden", () => {
		expect(mergeMessages(null)).toBe(BCHC_MESSAGES_EN);
	});

	it("applies overrides key by key", () => {
		const merged = mergeMessages({ close: "Fixture close", lang: "qaa" });
		expect(merged.close).toBe("Fixture close");
		expect(merged.lang).toBe("qaa");
		expect(merged.back).toBe(BCHC_MESSAGES_EN.back);
	});

	it("keeps English for keys a JavaScript caller sets to undefined", () => {
		const overrides = { close: undefined, getWallet: undefined };
		const merged = mergeMessages(overrides as unknown as Partial<BchcMessages>);
		expect(merged.close).toBe(BCHC_MESSAGES_EN.close);
		expect(merged.getWallet("X")).toBe(BCHC_MESSAGES_EN.getWallet("X"));
	});
});
