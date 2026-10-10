/**
 * Tests for the package entry.
 *
 * Frameworks import a UI package from server code as well as the browser, so
 * the entry must load where there is no DOM, and registering must do nothing
 * there rather than throw. The export list is pinned here so that adding or
 * dropping a public name is a decision someone makes, not a side effect.
 */

import { describe, expect, it } from "vitest";

describe("package entry", () => {
	it("should import without a DOM", async () => {
		expect(globalThis.HTMLElement).toBeUndefined();
		await expect(import("../src/index.ts")).resolves.toBeDefined();
	});

	it("should do nothing when defineElements runs without customElements", async () => {
		const { defineElements } = await import("../src/index.ts");
		expect(globalThis.customElements).toBeUndefined();
		expect(() => {
			defineElements();
			defineElements();
		}).not.toThrow();
	});

	it("should export exactly the public values", async () => {
		const entry = await import("../src/index.ts");
		expect(Object.keys(entry).sort()).toEqual([
			"BCHC_ACCENTS",
			"BCHC_ACCENT_DEFAULT_NEUTRAL",
			"BCHC_BLURS",
			"BCHC_DEFAULT_ACCENT",
			"BCHC_DEFAULT_NEUTRAL",
			"BCHC_DIRECTORY",
			"BCHC_FONTS",
			"BCHC_NEUTRALS",
			"BCHC_PROTOCOLS",
			"BCHC_RADII",
			"BCHC_WALLETS",
			"BchcModal",
			"BchcToast",
			"defineElements",
		]);
	});
});
