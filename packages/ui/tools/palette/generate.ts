/**
 * Emits the generated theme stylesheet from the resolved palette.
 *
 * Run with `node packages/ui/tools/palette/generate.ts` (Node strips the
 * types). The output is committed, so the library ships plain CSS and carries
 * no colour dependency at runtime.
 *
 * One choice worth defending: **light and dark share a single declaration via
 * `light-dark()`.** The alternative is emitting every scale twice, once under
 * an attribute selector and again under `prefers-color-scheme`, which doubles
 * the file and puts the two halves of one decision in two places. With
 * `light-dark()` the mode knob is just `color-scheme` on the host — which also
 * fixes scrollbars and any native control inside the modal for free.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Color from "colorjs.io";
import { type ResolvedScale, resolveScale } from "./palette.ts";
import {
	ACCENTS,
	type AccentRecipe,
	type BlurPreset,
	CODE,
	DARK_VEIL,
	FONT_STACKS,
	type FontPreset,
	LIGHT_VEIL,
	NEUTRALS,
	OVERLAY_BLUR,
	RADIUS,
	type RadiusPreset,
	type ScaleRecipe,
	SEMANTIC,
	STATUS,
	STEP_ROLES,
	type VeilRecipe,
} from "./recipes.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, "..", "..", "src", "styles", "theme.generated.css");

/**
 * The proof page's copy of what exists, so it cannot drift from the recipes.
 * Written as a plain script rather than JSON because the page is opened over
 * `file://`, where `fetch` is blocked by the origin rules.
 */
const MANIFEST_FILE = join(HERE, "proof.data.generated.js");

/**
 * The same enums as TypeScript unions.
 *
 * Without this the stylesheet and the eventual theme API would each carry their
 * own copy of "which accents exist", and the two would drift the first time one
 * is added. Both are generated from `recipes.ts` instead, so a new accent is
 * one line in one file.
 */
const TYPES_FILE = join(HERE, "..", "..", "src", "theme.generated.ts");

/**
 * Serialises a colour as sRGB hex.
 *
 * Authoring is OKLCH and every value is gamut-mapped into sRGB before it gets
 * here, so hex loses nothing — but it matters at the other end. A colour
 * authored as `oklch()` comes back out of `getComputedStyle().color` as an
 * `oklch()` string, and anything that has to parse a colour itself rather than
 * hand it to the CSS engine — a canvas, an SVG fill written by a library —
 * cannot read it. Hex resolves to `rgb(...)`, which everything parses.
 *
 * The readable form of this palette is `recipes.ts`, not its output.
 */
function css(color: Color, alpha?: number): string {
	const srgb = color.to("srgb");
	if (alpha !== undefined) srgb.alpha = alpha;
	return srgb.toString({ format: "hex", collapse: false });
}

/** `light-dark(a, b)` — one declaration carrying both palettes. */
function pair(light: string, dark: string): string {
	return `light-dark(${light}, ${dark})`;
}

/** Emits the twelve steps of a scale under a custom-property prefix. */
function emitSteps(
	prefix: string,
	light: ResolvedScale,
	dark: ResolvedScale,
): string[] {
	const lines: string[] = [];
	for (let step = 1; step <= 12; step++) {
		const lightStep = light.steps[step - 1];
		const darkStep = dark.steps[step - 1];
		if (lightStep === undefined || darkStep === undefined) continue;
		lines.push(
			`\t--bchc-${prefix}-${step}: ${pair(css(lightStep), css(darkStep))};`,
		);
	}
	return lines;
}

/**
 * The scrim and shadows.
 *
 * Both are built from the *dark end* of the neutral ramp, which is step 12 in
 * light mode and step 1 in dark — not step 12 in both. Step 12 is the
 * high-contrast text colour, so in dark mode it is the lightest value in the
 * scale: using it produced a near-white veil that washed the page out instead
 * of dimming it, and box-shadows that read as a glow. A scrim darkens and a
 * shadow is cast, in either theme.
 */
function emitVeil(
	light: Color,
	dark: Color,
	lightVeil: VeilRecipe,
	darkVeil: VeilRecipe,
): string[] {
	return [
		`\t--bchc-overlay: ${pair(css(light, lightVeil.overlay), css(dark, darkVeil.overlay))};`,
		`\t--bchc-shadow-soft: ${pair(css(light, lightVeil.shadowSoft), css(dark, darkVeil.shadowSoft))};`,
		`\t--bchc-shadow-tight: ${pair(css(light, lightVeil.shadowTight), css(dark, darkVeil.shadowTight))};`,
	];
}

function accentLines(recipe: AccentRecipe): string[] {
	const light = resolveScale(recipe, "light");
	const dark = resolveScale(recipe, "dark");
	const lines = [
		...emitSteps("accent", light, dark),
		`\t--bchc-accent-foreground: ${pair(css(light.foreground), css(dark.foreground))};`,
	];
	for (const [name, lightValue] of light.derived) {
		const darkValue = dark.derived.get(name);
		if (darkValue === undefined) continue;
		lines.push(
			`\t--bchc-accent-${name}: ${pair(css(lightValue), css(darkValue))};`,
		);
	}
	lines.push(`\t--bchc-neutral-family: ${recipe.neutral};`);
	return lines;
}

function neutralLines(recipe: ScaleRecipe): string[] {
	const light = resolveScale(recipe, "light");
	const dark = resolveScale(recipe, "dark");
	const lightInk = light.steps[11];
	const darkInk = dark.steps[0];
	if (lightInk === undefined || darkInk === undefined) {
		throw new Error(
			`Neutral "${recipe.name}" is missing a step to build its scrim from.`,
		);
	}
	return [
		...emitSteps("neutral", light, dark),
		...emitVeil(lightInk, darkInk, LIGHT_VEIL, DARK_VEIL),
	];
}

/**
 * An attribute selector that works whether the theme attribute sits on an
 * ordinary element or on a shadow host.
 *
 * This stylesheet is adopted into the modal's shadow root, and an adopted sheet
 * cannot match the host element with a plain attribute selector — only
 * `:host()` reaches it. Emitting the bare selector alone meant every knob set
 * on the host was silently ignored and the modal always fell back to the
 * defaults. Emitting both covers the shadow host and ordinary light-DOM use,
 * such as the proof page, from one block.
 */
function themed(selector: string): string {
	return `${selector},\n:host(${selector})`;
}

function emitAccent(recipe: AccentRecipe): string {
	return `${themed(`[data-bchc-accent="${recipe.name}"]`)} {\n${accentLines(recipe).join("\n")}\n}`;
}

function emitNeutral(recipe: ScaleRecipe): string {
	return `${themed(`[data-bchc-neutral="${recipe.name}"]`)} {\n${neutralLines(recipe).join("\n")}\n}`;
}

function emitBlur(): string {
	return (Object.keys(OVERLAY_BLUR) as BlurPreset[])
		.map(
			(preset) =>
				`${themed(`[data-bchc-blur="${preset}"]`)} {\n\t--bchc-overlay-blur: ${OVERLAY_BLUR[preset]}px;\n}`,
		)
		.join("\n\n");
}

function emitFont(): string {
	return (Object.keys(FONT_STACKS) as FontPreset[])
		.map(
			(preset) =>
				`${themed(`[data-bchc-font="${preset}"]`)} {\n\t--bchc-font-family: ${FONT_STACKS[preset]};\n}`,
		)
		.join("\n\n");
}

/**
 * Status hues are the same under every accent and never themed, so they are
 * emitted once. These are literal colours rather than `var()` references, so
 * unlike the semantic block they inherit correctly from a single declaration.
 */
function emitStatus(): string {
	const lines: string[] = [];
	for (const recipe of STATUS) {
		lines.push(
			...emitSteps(
				recipe.name,
				resolveScale(recipe, "light"),
				resolveScale(recipe, "dark"),
			),
		);
	}
	return `:where(:root, :host) {\n${lines.join("\n")}\n}`;
}

/**
 * The documented surface. Every one of these points at a step rather than
 * carrying a value, so a component never has to know which accent is active.
 */
function emitSemantic(): string {
	const lines: string[] = [];
	for (const [token, source] of Object.entries(SEMANTIC)) {
		const name = token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
		let value: string;
		if (source.from === "accentForeground") {
			value = "var(--bchc-accent-foreground)";
		} else if (source.from === "accentDerived") {
			value = `var(--bchc-accent-${source.name})`;
		} else {
			value = `var(--bchc-${source.from}-${source.step})`;
		}
		lines.push(`\t--bchc-${name}: ${value};`);
	}
	// Every selector that can carry a scale is listed, because a custom
	// property's `var()` references are substituted on the element where the
	// property is *declared*, not where it is used. Declared only on `:host`,
	// `--bchc-surface` would resolve once against the host's neutral and then
	// inherit that frozen colour into any descendant that set a different one.
	return `:where(:root, :host, [data-bchc-accent], [data-bchc-neutral], :host([data-bchc-accent]), :host([data-bchc-neutral])) {\n${lines.join("\n")}\n}`;
}

function emitRadius(): string {
	const blocks: string[] = [];
	for (const preset of Object.keys(RADIUS) as RadiusPreset[]) {
		const lines = Object.entries(RADIUS[preset]).map(
			([role, value]) => `\t--bchc-radius-${role}: ${value}px;`,
		);
		blocks.push(
			`${themed(`[data-bchc-radius="${preset}"]`)} {\n${lines.join("\n")}\n}`,
		);
	}
	return blocks.join("\n\n");
}

/** The mode knob is `color-scheme`, which is what `light-dark()` reads. */
function emitModes(): string {
	return [
		`${themed('[data-bchc-mode="auto"]')} {\n\tcolor-scheme: light dark;\n}`,
		`${themed('[data-bchc-mode="light"]')} {\n\tcolor-scheme: light;\n}`,
		`${themed('[data-bchc-mode="dark"]')} {\n\tcolor-scheme: dark;\n}`,
	].join("\n\n");
}

/**
 * The default theme, emitted in full at zero specificity via `:where()`.
 *
 * The full scales are repeated here rather than just naming the default,
 * because a host with no `data-bchc-*` attribute at all would otherwise resolve
 * no colour whatsoever — every `var(--bchc-surface)` would fall back to
 * nothing and the modal would render as unstyled text. The library always sets
 * the attributes, but a stylesheet that renders nothing on its own is a trap
 * for anyone reading it, and `:where()` means an explicit attribute still wins
 * without `!important` or a specificity contest.
 *
 * Neutral blocks are emitted after the accents that name them, so an explicit
 * `data-bchc-neutral` overrides an accent's default pairing on source order.
 */
function emitDefaults(): string {
	const accent = ACCENTS[0];
	if (accent === undefined) throw new Error("No accents defined.");
	const neutral = NEUTRALS.find((entry) => entry.name === accent.neutral);
	if (neutral === undefined) {
		throw new Error(
			`Default accent "${accent.name}" names neutral "${accent.neutral}", which does not exist.`,
		);
	}
	// The Pen prototype's 28px card is this system's `large`, so that is the
	// default rather than the arithmetic middle of the five presets.
	const radius: RadiusPreset = "large";
	const blur: BlurPreset = "small";
	const font: FontPreset = "brand";
	return [
		":where(:root, :host) {",
		`\t--bchc-default-accent: ${accent.name};`,
		`\t--bchc-default-neutral: ${accent.neutral};`,
		...accentLines(accent),
		...neutralLines(neutral),
		...Object.entries(RADIUS[radius]).map(
			([role, value]) => `\t--bchc-radius-${role}: ${value}px;`,
		),
		`\t--bchc-code-ink: ${CODE.ink};`,
		`\t--bchc-code-paper: ${CODE.paper};`,
		`\t--bchc-overlay-blur: ${OVERLAY_BLUR[blur]}px;`,
		`\t--bchc-font-family: ${FONT_STACKS[font]};`,
		"\tcolor-scheme: light dark;",
		"}",
	].join("\n");
}

function banner(): string {
	return [
		"/*",
		" * BCH Connect theme tokens. GENERATED FILE - do not edit by hand.",
		" *",
		" * Source of truth: packages/ui/tools/palette/recipes.ts",
		" * Regenerate:      node packages/ui/tools/palette/generate.ts",
		" * Verify:          node packages/ui/tools/palette/check.ts",
		" *",
		" * Step semantics follow the Radix Colors contract:",
		" *   1 app bg  2 subtle bg  3 UI bg  4 hover  5 active  6 subtle border",
		" *   7 border  8 hovered border  9 solid  10 hovered solid",
		" *   11 low-contrast text  12 high-contrast text",
		" *",
		" * Steps 11 and 12 are solved for a WCAG ratio against step 3 rather than",
		" * placed on a curve, so their contrast holds for every hue. The focus ring",
		" * is solved against step 1 and kept off the ladder entirely.",
		" */",
	].join("\n");
}

/** Indents a block by one tab so the emitted file reads like hand-written CSS. */
function indent(block: string): string {
	return block
		.split("\n")
		.map((line) => (line.length > 0 ? `\t${line}` : line))
		.join("\n");
}

/**
 * The whole stylesheet as a string.
 *
 * Exported separately from {@link main} so a test can rebuild it and compare
 * against the committed file — a generated artifact that has drifted from its
 * source is worse than no artifact, because it looks authoritative.
 */
export function buildStylesheet(): string {
	const inner = [
		emitDefaults(),
		emitModes(),
		...ACCENTS.map(emitAccent),
		...NEUTRALS.map(emitNeutral),
		emitStatus(),
		emitSemantic(),
		emitRadius(),
		emitBlur(),
		emitFont(),
	]
		.map(indent)
		.join("\n\n");

	return `${banner()}\n\n@layer bchconnect.palette {\n${inner}\n}\n`;
}

/** The proof page's manifest, for the same reason. */
export function buildManifest(): string {
	const manifest = {
		accents: ACCENTS.map((accent) => ({
			name: accent.name,
			neutral: accent.neutral,
		})),
		neutrals: NEUTRALS.map((neutral) => neutral.name),
		status: STATUS.map((status) => status.name),
		radius: Object.keys(RADIUS),
		fonts: Object.keys(FONT_STACKS),
		blurs: Object.keys(OVERLAY_BLUR),
		roles: STEP_ROLES,
		semantic: Object.keys(SEMANTIC).map((token) =>
			token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
		),
	};
	return (
		`/* GENERATED by generate.ts - do not edit. Mirrors recipes.ts for proof.html. */\n` +
		`globalThis.BCHC_THEME = ${JSON.stringify(manifest, null, "\t")};\n`
	);
}

/** The knob enums as TypeScript, for whatever eventually types the theme API. */
export function buildTypes(): string {
	const union = (values: readonly string[]): string =>
		values.map((value) => `"${value}"`).join(" | ");
	const list = (values: readonly string[]): string =>
		values.map((value) => `\t"${value}",`).join("\n");

	const accents = ACCENTS.map((accent) => accent.name);
	const neutrals = NEUTRALS.map((neutral) => neutral.name);
	const radius = Object.keys(RADIUS);
	const fonts = Object.keys(FONT_STACKS);
	const blurs = Object.keys(OVERLAY_BLUR);
	const first = ACCENTS[0];
	if (first === undefined) throw new Error("No accents defined.");

	return `/**
 * GENERATED FILE - do not edit by hand.
 *
 * Source of truth: tools/palette/recipes.ts
 * Regenerate:      node packages/ui/tools/palette/generate.ts
 *
 * Every value here is closed on purpose. A developer picks from these rather
 * than passing a colour, which is what lets the system guarantee contrast and
 * keeps the modal recognisable across the dapps that embed it. Each one maps to
 * a \`data-bchc-*\` attribute on the modal host; the matching declarations live
 * in \`styles/theme.generated.css\`.
 */

/** Curated accents. \`ink\` is achromatic, for monochrome brands. */
export type BchcAccent = ${union(accents)};

/**
 * Neutral families. Each accent is paired with one by default, so this is an
 * override rather than a required choice.
 */
export type BchcNeutral = ${union(neutrals)};

/** Radius presets. Each maps to an explicit value per role, not a multiplier. */
export type BchcRadius = ${union(radius)};

/** Font stacks. \`brand\` falls back to \`system\` until a face is injected. */
export type BchcFont = ${union(fonts)};

/** Backdrop blur behind the modal. */
export type BchcBlur = ${union(blurs)};

/** \`auto\` follows \`prefers-color-scheme\`. */
export type BchcMode = "auto" | "light" | "dark";

export const BCHC_ACCENTS = [
${list(accents)}
] as const;

export const BCHC_NEUTRALS = [
${list(neutrals)}
] as const;

export const BCHC_RADII = [
${list(radius)}
] as const;

export const BCHC_FONTS = [
${list(fonts)}
] as const;

export const BCHC_BLURS = [
${list(blurs)}
] as const;

/**
 * Which neutral each accent is paired with by default.
 *
 * The pairing cannot live in CSS: a stylesheet can declare
 * \`--bchc-neutral-family\` but nothing can select on a custom property's
 * value, so whoever sets the theme attributes has to resolve it. Radix frames
 * the pairing as aesthetic rather than accessible — "the difference is subtle",
 * their words — which is why it is a default here and \`data-bchc-neutral\`
 * overrides it.
 */
export const BCHC_ACCENT_NEUTRAL: Readonly<Record<BchcAccent, BchcNeutral>> = {
${ACCENTS.map((accent) => `\t${accent.name}: "${accent.neutral}",`).join("\n")}
};

export const BCHC_DEFAULT_ACCENT: BchcAccent = "${first.name}";
export const BCHC_DEFAULT_NEUTRAL: BchcNeutral = "${first.neutral}";
`;
}

async function main(): Promise<void> {
	await mkdir(dirname(OUT_FILE), { recursive: true });
	await writeFile(OUT_FILE, buildStylesheet(), "utf8");
	await writeFile(MANIFEST_FILE, buildManifest(), "utf8");
	await writeFile(TYPES_FILE, buildTypes(), "utf8");

	const scales = ACCENTS.length + NEUTRALS.length + STATUS.length;
	process.stdout.write(
		`Wrote ${OUT_FILE}\n` +
			`  ${scales} scales x 12 steps x 2 modes = ${scales * 24} values\n` +
			`  ${ACCENTS.length} accents, ${NEUTRALS.length} neutrals, ${STATUS.length} status, ` +
			`${Object.keys(RADIUS).length} radius presets\n`,
	);
}

// Only write files when run as a script. Importing this module — which the
// tests do, to rebuild the stylesheet and diff it against what is committed —
// must not touch the working tree.
if (import.meta.main) {
	await main();
}
