/**
 * Every built-in locale must be a complete, usable `BchcMessages`: same keys
 * as English, same shape per key, no accidentally-empty copy, and its own
 * `lang`. A locale that drifted from the interface would otherwise only
 * surface as a blank string in production.
 */

import { describe, expect, it } from "vitest";
import { BCHC_MESSAGES_ES } from "../src/locales/es.ts";
import { BCHC_MESSAGES_EN, type BchcMessages } from "../src/messages.ts";

const BUILT_IN_LOCALES: Readonly<Record<string, BchcMessages>> = {
	es: BCHC_MESSAGES_ES,
};

describe.each(Object.entries(BUILT_IN_LOCALES))(
	"%s locale",
	(_name, locale) => {
		it("has exactly the same keys as English", () => {
			expect(Object.keys(locale).sort()).toEqual(
				Object.keys(BCHC_MESSAGES_EN).sort(),
			);
		});

		it("gives each key the same type as English", () => {
			for (const key of Object.keys(
				BCHC_MESSAGES_EN,
			) as (keyof BchcMessages)[]) {
				expect(typeof locale[key], key).toBe(typeof BCHC_MESSAGES_EN[key]);
			}
		});

		it("has a lang tag that is non-empty and not English", () => {
			expect(locale.lang.length).toBeGreaterThan(0);
			expect(locale.lang).not.toBe("en");
		});

		it("never carries an empty string", () => {
			for (const [key, value] of Object.entries(locale)) {
				if (typeof value !== "string") continue;
				expect(value.length, key).toBeGreaterThan(0);
			}
		});

		it("returns a string that includes its argument from every function key", () => {
			expect(locale.getWallet("Probe Wallet")).toContain("Probe Wallet");
			expect(locale.connectedTo("Probe Wallet")).toContain("Probe Wallet");
		});
	},
);
