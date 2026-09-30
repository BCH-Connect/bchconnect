// Resolves the recipes in recipes.ts into actual colours, free of any notion
// of CSS. generate.ts and check.ts both call this, so they see exactly the
// same colours; check.ts must never re-derive its own.

import { apcach, crToBg, type SearchDirection } from "apcach";
import Color from "colorjs.io";
import {
	ACCENT_DERIVED,
	DARK_LADDER,
	LIGHT_LADDER,
	type ScaleRecipe,
	type StepStrategy,
} from "./recipes.ts";

/** The two authored palettes. Dark is not an inversion of light. */
export type Mode = "light" | "dark";

export const MODES: readonly Mode[] = ["light", "dark"];

export interface ResolvedScale {
	readonly steps: readonly Color[];
	readonly foreground: Color;
	readonly derived: ReadonlyMap<string, Color>;
}

// Gamut-maps into sRGB here (CSS Gamut Mapping Algorithm), not left to the
// browser: per-channel clipping shifts hue at saturated steps.
export function oklch(lightness: number, chroma: number, hue: number): Color {
	return new Color("oklch", [lightness, chroma, hue]).toGamut({
		space: "srgb",
		method: "css",
	});
}

// A component can be `null` (CSS `none`, e.g. an achromatic hue) or `NaN`
// depending on the conversion path; both fold to 0, as CSS does for `none`.
export function oklchCoords(color: Color): readonly [number, number, number] {
	const [lightness, chroma, hue] = color.to("oklch").coords;
	const clean = (value: number | null): number =>
		value === null || Number.isNaN(value) ? 0 : value;
	return [clean(lightness), clean(chroma), clean(hue)];
}

export function lightnessOf(color: Color): number {
	return oklchCoords(color)[0];
}

// apcach defaults to P3; sRGB must be requested explicitly, or the solved
// lightness is correct for a gamut this palette doesn't ship into.
export function solveForContrast(
	against: Color,
	ratio: number,
	chroma: number,
	hue: number,
	direction: SearchDirection,
): Color {
	const solved = apcach(
		crToBg(
			against.to("srgb").toString({ format: "hex" }),
			ratio,
			"wcag",
			direction,
		),
		chroma,
		hue,
		100,
		"srgb",
	);
	return oklch(solved.lightness, chroma, hue);
}

function stepColor(
	resolved: Map<number, Color>,
	step: number,
	scale: string,
): Color {
	const color = resolved.get(step);
	if (color === undefined) {
		throw new Error(
			`Scale "${scale}" asked for step ${step} before it was resolved. ` +
				"Check the ladder's dependency order in recipes.ts.",
		);
	}
	return color;
}

// Passes run in dependency order, not step order: curve stands alone,
// contrast needs step 3, solid may need step 12, shift needs the solid.
function resolveSteps(
	recipe: ScaleRecipe,
	ladder: readonly StepStrategy[],
	mode: Mode,
): readonly Color[] {
	const resolved = new Map<number, Color>();
	const at = (index: number): StepStrategy => {
		const strategy = ladder[index];
		if (strategy === undefined) {
			throw new Error(
				`Ladder for "${recipe.name}" is missing step ${index + 1}.`,
			);
		}
		return strategy;
	};

	for (let i = 0; i < ladder.length; i++) {
		const strategy = at(i);
		if (strategy.kind === "curve") {
			resolved.set(
				i + 1,
				oklch(
					strategy.lightness,
					recipe.chroma * strategy.chromaScale,
					recipe.hue,
				),
			);
		}
	}

	for (let i = 0; i < ladder.length; i++) {
		const strategy = at(i);
		if (strategy.kind !== "contrast") continue;
		resolved.set(
			i + 1,
			solveForContrast(
				stepColor(resolved, strategy.against, recipe.name),
				strategy.ratio,
				recipe.chroma * strategy.chromaScale,
				recipe.hue,
				strategy.direction,
			),
		);
	}

	for (let i = 0; i < ladder.length; i++) {
		const strategy = at(i);
		if (strategy.kind !== "solid") continue;
		const solid = recipe.solidLightness;
		if (solid === "contrast") {
			resolved.set(i + 1, stepColor(resolved, 12, recipe.name));
		} else {
			const lightness = typeof solid === "number" ? solid : solid[mode];
			resolved.set(i + 1, oklch(lightness, recipe.chroma, recipe.hue));
		}
	}

	for (let i = 0; i < ladder.length; i++) {
		const strategy = at(i);
		if (strategy.kind !== "shift") continue;
		const lightness = lightnessOf(
			stepColor(resolved, strategy.from, recipe.name),
		);
		resolved.set(
			i + 1,
			oklch(
				Math.min(1, Math.max(0, lightness + strategy.deltaLightness)),
				recipe.chroma * strategy.chromaScale,
				recipe.hue,
			),
		);
	}

	return Array.from({ length: ladder.length }, (_, i) =>
		stepColor(resolved, i + 1, recipe.name),
	);
}

// Per-accent, never a constant: BCH green sits at only 2.33:1 against white,
// so hardcoding white text would fail for it. The scale's own step 12/1 are
// tried before the pure black/white fallback.
function resolveForeground(steps: readonly Color[], scale: string): Color {
	const solid = steps[8];
	if (solid === undefined) throw new Error(`Scale "${scale}" has no step 9.`);

	const candidates: readonly Color[] = [
		steps[11] ?? new Color("oklch", [0.15, 0, 0]),
		steps[0] ?? new Color("oklch", [0.99, 0, 0]),
		new Color("oklch", [0, 0, 0]),
		new Color("oklch", [1, 0, 0]),
	];

	let best = solid;
	let bestRatio = 0;
	for (const candidate of candidates) {
		const ratio = Math.abs(solid.contrastWCAG21(candidate));
		if (ratio > bestRatio) {
			best = candidate;
			bestRatio = ratio;
		}
		// Past the 4.5:1 floor; stopping early keeps the palette's own tinted
		// poles ahead of pure black/white.
		if (bestRatio >= 4.8) break;
	}
	return best;
}

// Search direction follows the mode: light needs darker than the surface to
// be seen, dark needs lighter.
function resolveDerived(
	recipe: ScaleRecipe,
	steps: readonly Color[],
	mode: Mode,
): ReadonlyMap<string, Color> {
	const derived = new Map<string, Color>();
	for (const entry of ACCENT_DERIVED) {
		const against = steps[entry.against - 1];
		if (against === undefined) {
			throw new Error(
				`"${recipe.name}" cannot solve "${entry.name}": step ${entry.against} is missing.`,
			);
		}
		derived.set(
			entry.name,
			solveForContrast(
				against,
				entry.ratio,
				recipe.chroma * entry.chromaScale,
				recipe.hue,
				mode === "light" ? "darker" : "lighter",
			),
		);
	}
	return derived;
}

export function resolveScale(recipe: ScaleRecipe, mode: Mode): ResolvedScale {
	const steps = resolveSteps(
		recipe,
		mode === "light" ? LIGHT_LADDER : DARK_LADDER,
		mode,
	);
	return {
		steps,
		foreground: resolveForeground(steps, recipe.name),
		derived: resolveDerived(recipe, steps, mode),
	};
}
