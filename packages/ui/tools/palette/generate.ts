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
import { oklchCoords, type ResolvedScale, resolveScale } from "./palette.ts";
import {
	ACCENTS,
	type AccentRecipe,
	DARK_VEIL,
	LIGHT_VEIL,
	NEUTRALS,
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

/** Serialises a colour as `oklch(L% C H)`, rounded to what the eye can resolve. */
function css(color: Color, alpha?: number): string {
	const [lightness, chroma, hue] = oklchCoords(color);
	const base = `${(lightness * 100).toFixed(1)}% ${chroma.toFixed(4)} ${hue.toFixed(1)}`;
	return alpha === undefined ? `oklch(${base})` : `oklch(${base} / ${alpha})`;
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

/** The scrim and shadows, built from the neutral's darkest step. */
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

function emitAccent(recipe: AccentRecipe): string {
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
	return `[data-bchc-accent="${recipe.name}"] {\n${lines.join("\n")}\n}`;
}

function emitNeutral(recipe: ScaleRecipe): string {
	const light = resolveScale(recipe, "light");
	const dark = resolveScale(recipe, "dark");
	const lightInk = light.steps[11];
	const darkInk = dark.steps[11];
	if (lightInk === undefined || darkInk === undefined) {
		throw new Error(
			`Neutral "${recipe.name}" has no step 12 to build its scrim from.`,
		);
	}
	const lines = [
		...emitSteps("neutral", light, dark),
		...emitVeil(lightInk, darkInk, LIGHT_VEIL, DARK_VEIL),
	];
	return `[data-bchc-neutral="${recipe.name}"] {\n${lines.join("\n")}\n}`;
}

/** Status hues are the same under every accent, so they are emitted once. */
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
	return `:where([data-bchc-accent]) {\n${lines.join("\n")}\n}`;
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
	return `:where([data-bchc-accent]) {\n${lines.join("\n")}\n}`;
}

function emitRadius(): string {
	const blocks: string[] = [];
	for (const preset of Object.keys(RADIUS) as RadiusPreset[]) {
		const lines = Object.entries(RADIUS[preset]).map(
			([role, value]) => `\t--bchc-radius-${role}: ${value}px;`,
		);
		blocks.push(`[data-bchc-radius="${preset}"] {\n${lines.join("\n")}\n}`);
	}
	return blocks.join("\n\n");
}

/** The mode knob is `color-scheme`, which is what `light-dark()` reads. */
function emitModes(): string {
	return [
		'[data-bchc-mode="auto"] {\n\tcolor-scheme: light dark;\n}',
		'[data-bchc-mode="light"] {\n\tcolor-scheme: light;\n}',
		'[data-bchc-mode="dark"] {\n\tcolor-scheme: dark;\n}',
	].join("\n\n");
}

/**
 * Defaults sit at zero specificity via `:where()`, so any explicit attribute
 * wins without `!important` and without a specificity arms race. Neutral blocks
 * are emitted after the accents that name them, so an explicit
 * `data-bchc-neutral` overrides an accent's default pairing on source order.
 */
function emitDefaults(): string {
	const first = ACCENTS[0];
	if (first === undefined) throw new Error("No accents defined.");
	return [
		":where(:root, :host) {",
		`\t--bchc-default-accent: ${first.name};`,
		`\t--bchc-default-neutral: ${first.neutral};`,
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

async function main(): Promise<void> {
	const inner = [
		emitDefaults(),
		emitModes(),
		...ACCENTS.map(emitAccent),
		...NEUTRALS.map(emitNeutral),
		emitStatus(),
		emitSemantic(),
		emitRadius(),
	]
		.map(indent)
		.join("\n\n");

	const file = `${banner()}\n\n@layer bchconnect.palette {\n${inner}\n}\n`;

	await mkdir(dirname(OUT_FILE), { recursive: true });
	await writeFile(OUT_FILE, file, "utf8");

	const manifest = {
		accents: ACCENTS.map((accent) => ({
			name: accent.name,
			neutral: accent.neutral,
		})),
		neutrals: NEUTRALS.map((neutral) => neutral.name),
		status: STATUS.map((status) => status.name),
		radius: Object.keys(RADIUS),
		roles: STEP_ROLES,
		semantic: Object.keys(SEMANTIC).map((token) =>
			token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
		),
	};
	await writeFile(
		MANIFEST_FILE,
		`/* GENERATED by generate.ts - do not edit. Mirrors recipes.ts for proof.html. */\n` +
			`globalThis.BCHC_THEME = ${JSON.stringify(manifest, null, "\t")};\n`,
		"utf8",
	);

	const scales = ACCENTS.length + NEUTRALS.length + STATUS.length;
	process.stdout.write(
		`Wrote ${OUT_FILE}\n` +
			`  ${scales} scales x 12 steps x 2 modes = ${scales * 24} values\n` +
			`  ${ACCENTS.length} accents, ${NEUTRALS.length} neutrals, ${STATUS.length} status, ` +
			`${Object.keys(RADIUS).length} radius presets\n`,
	);
}

await main();
