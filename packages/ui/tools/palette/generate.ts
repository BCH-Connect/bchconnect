// Generates `theme.generated.css`, `theme.generated.ts` and the proof-page manifest
// from `recipes.ts`. Run with `pnpm palette`; the output is committed.

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

const MANIFEST_FILE = join(HERE, "proof.data.generated.js");

/** The knob enums as TypeScript unions, generated so CSS and types share one source. */
const TYPES_FILE = join(HERE, "..", "..", "src", "theme.generated.ts");

// Hex round-trips through getComputedStyle() as rgb(), which any parser reads.
function css(color: Color, alpha?: number): string {
	const srgb = color.to("srgb");
	if (alpha !== undefined) srgb.alpha = alpha;
	return srgb.toString({ format: "hex", collapse: false });
}

function pair(light: string, dark: string): string {
	return `light-dark(${light}, ${dark})`;
}

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

// Built from the dark end of the neutral ramp: step 12 in light mode, step 1 in dark.
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

// Selects the attribute on a shadow host (:host([…])) too: an adopted sheet
// can't match its host with a plain selector.
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
	return Object.entries(OVERLAY_BLUR)
		.map(
			([preset, px]) =>
				`${themed(`[data-bchc-blur="${preset}"]`)} {\n\t--bchc-overlay-blur: ${px}px;\n}`,
		)
		.join("\n\n");
}

function emitFont(): string {
	return Object.entries(FONT_STACKS)
		.map(
			([preset, stack]) =>
				`${themed(`[data-bchc-font="${preset}"]`)} {\n\t--bchc-font-family: ${stack};\n}`,
		)
		.join("\n\n");
}

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

function emitSemantic(): string {
	const lines: string[] = [];
	for (const [token, source] of Object.entries(SEMANTIC)) {
		const name = token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
		// Each accent scale already declares it under this name; aliasing it here would be a cycle.
		if (source.from === "accentForeground") continue;
		let value: string;
		if (source.from === "accentDerived") {
			value = `var(--bchc-accent-${source.name})`;
		} else {
			value = `var(--bchc-${source.from}-${source.step})`;
		}
		lines.push(`\t--bchc-${name}: ${value};`);
	}
	// Declared on every selector that can carry a scale: `var()` resolves where
	// declared, so `:host` alone would freeze the host's values.
	return `:where(:root, :host, [data-bchc-accent], [data-bchc-neutral], :host([data-bchc-accent]), :host([data-bchc-neutral])) {\n${lines.join("\n")}\n}`;
}

function emitRadius(): string {
	const blocks: string[] = [];
	for (const [preset, row] of Object.entries(RADIUS)) {
		const lines = Object.entries(row).map(
			([role, value]) => `\t--bchc-radius-${role}: ${value}px;`,
		);
		blocks.push(
			`${themed(`[data-bchc-radius="${preset}"]`)} {\n${lines.join("\n")}\n}`,
		);
	}
	return blocks.join("\n\n");
}

function emitModes(): string {
	return [
		`${themed('[data-bchc-mode="auto"]')} {\n\tcolor-scheme: light dark;\n}`,
		`${themed('[data-bchc-mode="light"]')} {\n\tcolor-scheme: light;\n}`,
		`${themed('[data-bchc-mode="dark"]')} {\n\tcolor-scheme: dark;\n}`,
	].join("\n\n");
}

// Zero specificity via `:where()`, so a host without data-bchc-* still
// resolves every token and an explicit attribute wins without `!important`.
function emitDefaults(): string {
	const accent = ACCENTS[0];
	if (accent === undefined) throw new Error("No accents defined.");
	const neutral = NEUTRALS.find((entry) => entry.name === accent.neutral);
	if (neutral === undefined) {
		throw new Error(
			`Default accent "${accent.name}" names neutral "${accent.neutral}", which does not exist.`,
		);
	}
	// `large` (28px) is the default modal radius, not the arithmetic middle of
	// the five presets.
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
		`\t--bchc-code-foreground: ${CODE.foreground};`,
		`\t--bchc-code-background: ${CODE.background};`,
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
		" */",
	].join("\n");
}

function indent(block: string): string {
	return block
		.split("\n")
		.map((line) => (line.length > 0 ? `\t${line}` : line))
		.join("\n");
}

// Exported so the drift test can rebuild and diff it.
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
 * Every value here is closed on purpose: picking from these, instead of a raw
 * colour, is what lets the system guarantee contrast. Each maps to a
 * \`data-bchc-*\` attribute on the modal host; the matching declarations live
 * in \`styles/theme.generated.css\`.
 */

/**
 * Curated accents. \`ink\` is achromatic, for monochrome brands.
 *
 * @beta
 */
export type BchcAccent = ${union(accents)};

/**
 * Neutral families. Each accent is paired with one by default, so this is an
 * override rather than a required choice.
 *
 * @beta
 */
export type BchcNeutral = ${union(neutrals)};

/**
 * Radius presets. Each maps to an explicit value per role, not a multiplier.
 *
 * @beta
 */
export type BchcRadius = ${union(radius)};

/**
 * Font stacks. \`brand\` falls back to \`system\` until a face is injected.
 *
 * @beta
 */
export type BchcFont = ${union(fonts)};

/**
 * Backdrop blur behind the modal.
 *
 * @beta
 */
export type BchcBlur = ${union(blurs)};

/**
 * \`auto\` follows \`prefers-color-scheme\`.
 *
 * @beta
 */
export type BchcMode = "auto" | "light" | "dark";

/**
 * The values of {@link BchcAccent}, in display order.
 *
 * @beta
 */
export const BCHC_ACCENTS = [
${list(accents)}
] as const;

/**
 * The values of {@link BchcNeutral}, in display order.
 *
 * @beta
 */
export const BCHC_NEUTRALS = [
${list(neutrals)}
] as const;

/**
 * The values of {@link BchcRadius}, in display order.
 *
 * @beta
 */
export const BCHC_RADII = [
${list(radius)}
] as const;

/**
 * The values of {@link BchcFont}, in display order.
 *
 * @beta
 */
export const BCHC_FONTS = [
${list(fonts)}
] as const;

/**
 * The values of {@link BchcBlur}, in display order.
 *
 * @beta
 */
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
 *
 * @beta
 */
export const BCHC_ACCENT_DEFAULT_NEUTRAL: Readonly<Record<BchcAccent, BchcNeutral>> = {
${ACCENTS.map((accent) => `\t${accent.name}: "${accent.neutral}",`).join("\n")}
};

/**
 * The accent applied when a caller sets no \`data-bchc-accent\` attribute.
 *
 * @beta
 */
export const BCHC_DEFAULT_ACCENT: BchcAccent = "${first.name}";

/**
 * The neutral applied when a caller sets no \`data-bchc-neutral\` attribute.
 *
 * @beta
 */
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

// Only writes when run as a script; the drift test imports this without touching the tree.
if (import.meta.main) {
	await main();
}
