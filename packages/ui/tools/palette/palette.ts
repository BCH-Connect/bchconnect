/**
 * Resolves the recipes in `./recipes.ts` into actual colours.
 *
 * This module is deliberately free of any notion of CSS. `generate.ts` turns
 * what comes out of here into a stylesheet and `check.ts` gates it, and both
 * need to be looking at exactly the same colours — a checker that re-derives
 * its own values is checking its own arithmetic, not the shipped palette.
 */

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

/**
 * A scale resolved for one mode: twelve steps, the solid's foreground, and any
 * off-ladder values solved against those steps.
 */
export interface ResolvedScale {
	readonly steps: readonly Color[];
	readonly foreground: Color;
	readonly derived: ReadonlyMap<string, Color>;
}

/**
 * Builds an OKLCH colour already mapped into the sRGB gamut.
 *
 * The mapping is not a formality. Maximum chroma varies by hue and by
 * lightness, and browsers have historically clipped out-of-gamut colours
 * channel by channel, which shifts hue — a "blue" that quietly turns purple at
 * its most saturated step. Mapping here, with the CSS Gamut Mapping Algorithm,
 * means the committed value is the one that renders.
 */
export function oklch(lightness: number, chroma: number, hue: number): Color {
	return new Color("oklch", [lightness, chroma, hue]).toGamut({
		space: "srgb",
		method: "css",
	});
}

/**
 * OKLCH coordinates with missing components resolved to zero.
 *
 * Colour.js types each coordinate as `number | null` because CSS Color 4 lets a
 * component be `none`, and an achromatic colour's hue is genuinely powerless —
 * the `ink` accent and the `pure` neutral produce exactly that. CSS treats
 * `none` as zero in any computation, and so does this. Some conversion paths
 * surface the same idea as `NaN` rather than `null`, so both are folded here
 * instead of at each call site.
 */
export function oklchCoords(color: Color): readonly [number, number, number] {
	const [lightness, chroma, hue] = color.to("oklch").coords;
	const clean = (value: number | null): number =>
		value === null || Number.isNaN(value) ? 0 : value;
	return [clean(lightness), clean(chroma), clean(hue)];
}

/** OKLCH lightness of a colour, 0-1. */
export function lightnessOf(color: Color): number {
	return oklchCoords(color)[0];
}

/**
 * Solves a colour's lightness so it hits `ratio` against `against`, keeping the
 * chroma and hue it was asked for.
 *
 * apcach defaults its colour space to P3; sRGB has to be requested explicitly,
 * or the lightness it solves is correct for a gamut we do not ship into.
 */
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

/** Reads a step that must already be resolved, or fails loudly. */
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

/**
 * Resolves one scale's twelve steps for one mode.
 *
 * The passes run in dependency order rather than step order: curve steps stand
 * alone, contrast steps need only step 3, the solid may fall back to step 12
 * (the achromatic `ink` accent does), and `shift` needs the solid. Walking the
 * ladder in step order instead would ask for step 10 before step 9 exists.
 */
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

/**
 * Picks the text colour that sits on a scale's solid.
 *
 * This is per-accent data, never a constant. Bitcoin Cash green sits at 2.33:1
 * against white, so a library that assumed white button text would ship a
 * failing default — and RainbowKit had to delete a curated accent post-release
 * for exactly this. The scale's own step 12 and step 1 are tried first, because
 * a tinted near-black or near-white belongs to the palette in a way that pure
 * black and pure white do not; the pure poles are the fallback.
 */
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
		// Comfortably past the 4.5:1 floor these button labels need. Stopping
		// early is what keeps the palette's own tinted poles in front of pure
		// black and white.
		if (bestRatio >= 4.8) break;
	}
	return best;
}

/**
 * Resolves the off-ladder values. The search direction follows the mode: in
 * light mode a ring has to go darker than the surface to be seen, in dark mode
 * lighter.
 */
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
