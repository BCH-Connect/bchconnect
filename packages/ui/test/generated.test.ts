/**
 * Tests for the emitted stylesheet.
 *
 * Two failures these catch that nothing else can: a committed artifact that has
 * drifted from the source it claims to be generated from, and a `var()` that
 * points at a custom property nobody declares. The second one is silent in a
 * browser — the declaration is simply dropped and the element falls back to
 * whatever it inherited — so it is exactly the kind of bug that ships.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	BCHC_ACCENTS,
	BCHC_BLURS,
	BCHC_DEFAULT_ACCENT,
	BCHC_DEFAULT_NEUTRAL,
	BCHC_FONTS,
	BCHC_NEUTRALS,
	BCHC_RADII,
} from "../src/theme.generated.ts";
import {
	buildManifest,
	buildStylesheet,
	buildTypes,
} from "../tools/palette/generate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = join(HERE, "..", "src", "styles");
const GENERATED = join(STYLES, "theme.generated.css");
const TOKENS = join(STYLES, "tokens.css");
const MODAL = join(STYLES, "modal.css");
const TOAST = join(STYLES, "toast.css");
const MANIFEST = join(
	HERE,
	"..",
	"tools",
	"palette",
	"proof.data.generated.js",
);
const TYPES = join(HERE, "..", "src", "theme.generated.ts");

/** The values an attribute is given a block for in the stylesheet. */
function attributeValues(css: string, attribute: string): Set<string> {
	const pattern = new RegExp(`\\[data-bchc-${attribute}="([\\w-]+)"\\]`, "g");
	return new Set([...css.matchAll(pattern)].map((match) => match[1] ?? ""));
}

/** Every `--bchc-*` custom property a stylesheet declares. */
function declaredIn(css: string): Set<string> {
	return new Set(
		[...css.matchAll(/^\s*(--bchc-[\w-]+)\s*:/gm)].map(
			(match) => match[1] ?? "",
		),
	);
}

/** Every `--bchc-*` custom property a stylesheet reads through `var()`. */
function referencedIn(css: string): Set<string> {
	return new Set(
		[...css.matchAll(/var\(\s*(--bchc-[\w-]+)/g)].map(
			(match) => match[1] ?? "",
		),
	);
}

describe("the committed artifact", () => {
	it("matches what the generator produces right now", async () => {
		const onDisk = await readFile(GENERATED, "utf8");
		expect(onDisk).toBe(buildStylesheet());
	});

	it("matches the committed proof manifest", async () => {
		const onDisk = await readFile(MANIFEST, "utf8");
		expect(onDisk).toBe(buildManifest());
	});

	it("matches the committed theme types", async () => {
		const onDisk = await readFile(TYPES, "utf8");
		expect(onDisk).toBe(buildTypes());
	});

	it("says it is generated, so nobody edits it by hand", async () => {
		const css = await readFile(GENERATED, "utf8");
		expect(css).toContain("GENERATED FILE - do not edit by hand");
		expect(css).toContain("tools/palette/recipes.ts");
	});
});

describe("custom property references", () => {
	it("resolve against something that is actually declared", async () => {
		const css = `${await readFile(GENERATED, "utf8")}\n${await readFile(TOKENS, "utf8")}`;
		const declared = declaredIn(css);
		const dangling = [...referencedIn(css)].filter(
			(name) =>
				!declared.has(name) &&
				// The one intentional exception: the library sets this at document
				// level when it injects the brand @font-face, because Shadow DOM
				// cannot declare fonts. The stylesheet supplies a fallback for it.
				name !== "--bchc-font-brand-family",
		);
		expect(dangling).toEqual([]);
	});

	it("declares every token the component stylesheets reach for", async () => {
		// The hand-picked list this replaced could go stale the moment a
		// component started reading a token nobody added here; this instead
		// reads modal.css and toast.css themselves, so it can't miss one.
		const [generated, tokens, modal, toast] = await Promise.all(
			[GENERATED, TOKENS, MODAL, TOAST].map((file) => readFile(file, "utf8")),
		);
		const declared = declaredIn(`${generated}\n${tokens}\n${modal}\n${toast}`);
		const referenced = referencedIn(`${modal}\n${toast}`);
		const missing = [...referenced].filter(
			(name) => !declared.has(name) && name !== "--bchc-font-brand-family",
		);
		expect(missing).toEqual([]);
	});

	it("never declares a token in terms of itself", async () => {
		// A self-reference is a cycle, which CSS resolves to an empty value.
		const css = await readFile(GENERATED, "utf8");
		const cycles = [...css.matchAll(/(--[\w-]+)\s*:([^;]*);/g)]
			.filter(([, name, value]) => value?.includes(`var(${name})`))
			.map(([declaration]) => declaration);
		expect(cycles).toEqual([]);
	});
});

describe("the default theme", () => {
	it("renders on a host with no attributes set", async () => {
		// A stylesheet that resolves to nothing without `data-bchc-accent` is a
		// trap. The defaults are emitted in full at zero specificity so a bare
		// host still paints, and any explicit attribute still wins.
		const css = await readFile(GENERATED, "utf8");
		const defaults = css.slice(
			css.indexOf(":where(:root, :host) {"),
			css.indexOf("[data-bchc-mode="),
		);
		expect(defaults).toContain("--bchc-accent-9:");
		expect(defaults).toContain("--bchc-neutral-1:");
		expect(defaults).toContain("--bchc-accent-foreground:");
		expect(defaults).toContain("--bchc-radius-modal:");
		expect(defaults).toContain("color-scheme: light dark;");
	});
});

describe("the TypeScript unions", () => {
	it("name exactly the values the stylesheet has blocks for", async () => {
		// The drift this prevents: adding a ninth accent to the types but not the
		// CSS, or the reverse. A developer would pass a value the compiler
		// accepts and get an unthemed modal, with nothing failing anywhere.
		const css = await readFile(GENERATED, "utf8");
		for (const [attribute, values] of [
			["accent", BCHC_ACCENTS],
			["neutral", BCHC_NEUTRALS],
			["radius", BCHC_RADII],
			["font", BCHC_FONTS],
			["blur", BCHC_BLURS],
		] as const) {
			expect([...attributeValues(css, attribute)].sort(), attribute).toEqual(
				[...values].sort(),
			);
		}
	});

	it("name a default that the stylesheet actually applies", async () => {
		const css = await readFile(GENERATED, "utf8");
		expect(css).toContain(`--bchc-default-accent: ${BCHC_DEFAULT_ACCENT};`);
		expect(css).toContain(`--bchc-default-neutral: ${BCHC_DEFAULT_NEUTRAL};`);
		expect([...BCHC_ACCENTS]).toContain(BCHC_DEFAULT_ACCENT);
		expect([...BCHC_NEUTRALS]).toContain(BCHC_DEFAULT_NEUTRAL);
	});
});

describe("both modes in one declaration", () => {
	it("uses light-dark() rather than emitting each scale twice", async () => {
		const css = await readFile(GENERATED, "utf8");
		expect(css).toContain("light-dark(");
		expect(css).not.toContain("prefers-color-scheme");
	});
});
