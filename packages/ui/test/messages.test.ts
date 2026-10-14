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

	it("returns English when a JavaScript caller passes undefined", () => {
		expect(
			mergeMessages(undefined as unknown as Partial<BchcMessages> | null),
		).toBe(BCHC_MESSAGES_EN);
	});

	it("keeps English for keys a JavaScript caller sets to undefined or null", () => {
		const overrides = { close: undefined, back: null, getWallet: undefined };
		const merged = mergeMessages(overrides as unknown as Partial<BchcMessages>);
		expect(merged.close).toBe(BCHC_MESSAGES_EN.close);
		expect(merged.back).toBe(BCHC_MESSAGES_EN.back);
		expect(merged.getWallet("X")).toBe(BCHC_MESSAGES_EN.getWallet("X"));
	});
});
