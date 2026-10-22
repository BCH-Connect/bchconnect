/**
 * Tests for the package entry.
 *
 * Frameworks import a UI package from server code as well as the browser, so
 * the entry must load where there is no DOM, and registering there must go to
 * Lit's server registry rather than throw. The export list is pinned here so that adding or
 * dropping a public name is a decision someone makes, not a side effect.
 */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("package entry", () => {
	it("should import without a DOM", async () => {
		expect(globalThis.HTMLElement).toBeUndefined();
		await expect(import("../src/index.ts")).resolves.toBeDefined();
	});

	it("should register both elements in Lit's server registry, idempotently", async () => {
		const { BchcModal, BchcToast, defineElements } = await import(
			"../src/index.ts"
		);
		expect(() => {
			defineElements();
			defineElements();
		}).not.toThrow();
		expect(customElements.get("bchc-toast")).toBe(BchcToast);
		expect(customElements.get("bchc-modal")).toBe(BchcModal);
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
			"BCHC_MESSAGES_EN",
			"BCHC_NEUTRALS",
			"BCHC_PROTOCOLS",
			"BCHC_RADII",
			"BCHC_WALLETS",
			"BchcModal",
			"BchcToast",
			"defineElements",
			"headlessModal",
		]);
	});
});

// Follows relative imports from `file` and collects every bare specifier.
async function packagesImportedBy(file: URL, seen = new Set<string>()) {
	const packages = new Set<string>();
	if (seen.has(file.href)) return packages;
	seen.add(file.href);
	const source = await readFile(file, "utf8");
	for (const [, specifier] of source.matchAll(
		/^(?:import|export)\b(?:[^;]*?from)?\s*"([^"]+)";/gm,
	)) {
		if (specifier === undefined) continue;
		if (!specifier.startsWith(".")) {
			packages.add(specifier);
			continue;
		}
		for (const name of await packagesImportedBy(
			new URL(specifier, file),
			seen,
		)) {
			packages.add(name);
		}
	}
	return packages;
}

describe("headless entry", () => {
	it("should export only the headless modal", async () => {
		const entry = await import("../src/headless.ts");
		expect(Object.keys(entry)).toEqual(["headlessModal"]);
	});

	it("should load no element code, Lit or QR library", async () => {
		const packages = await packagesImportedBy(
			new URL("../src/headless.ts", import.meta.url),
		);
		expect([...packages].sort()).toEqual(["@bchconnect/core"]);
	});
});
