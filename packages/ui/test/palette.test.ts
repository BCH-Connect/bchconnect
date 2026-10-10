/**
 * Tests for the colour machinery, not for the colours.
 *
 * `tools/palette/check.ts` already proves the shipped palette meets WCAG across
 * every accent, neutral and mode. What it cannot tell you is *why* it passes:
 * a refactor that quietly stopped honouring `solidLightness`, or that resolved
 * the ladder in the wrong order, could still emit a set of colours that happen
 * to clear contrast. These lock the semantics instead.
 */

import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import {
	lightnessOf,
	MODES,
	oklchCoords,
	resolveScale,
} from "../tools/palette/palette.ts";
import {
	ACCENTS,
	DARK_LADDER,
	LIGHT_LADDER,
	NEUTRALS,
	type ScaleRecipe,
	SEMANTIC,
	STATUS,
} from "../tools/palette/recipes.ts";

const ALL_SCALES: readonly ScaleRecipe[] = [...ACCENTS, ...NEUTRALS, ...STATUS];

function scaleByName(name: string): ScaleRecipe {
	const recipe = ALL_SCALES.find((entry) => entry.name === name);
	if (recipe === undefined) throw new Error(`No scale named "${name}".`);
	return recipe;
}

function stepOf(steps: readonly Color[], step: number): Color {
	const color = steps[step - 1];
	if (color === undefined) throw new Error(`Missing step ${step}.`);
	return color;
}

describe("oklchCoords", () => {
	it("resolves a powerless hue to zero rather than leaking null or NaN", () => {
		// An achromatic colour has no meaningful hue. Colour.js reports that as
		// `null` or `NaN` depending on the path, and either would serialise into
		// the stylesheet as `oklch(20% 0 NaN)`, which no browser parses.
		const [, chroma, hue] = oklchCoords(new Color("srgb", [0.2, 0.2, 0.2]));
		expect(chroma).toBeCloseTo(0, 5);
		expect(hue).toBe(0);
		expect(Number.isNaN(hue)).toBe(false);
	});
});

describe("ladders", () => {
	it.each(MODES)("%s ladder has twelve rungs", (mode) => {
		const ladder = mode === "light" ? LIGHT_LADDER : DARK_LADDER;
		expect(ladder).toHaveLength(12);
	});

	it.each(MODES)("resolves twelve steps for every scale in %s", (mode) => {
		for (const recipe of ALL_SCALES) {
			expect(resolveScale(recipe, mode).steps).toHaveLength(12);
		}
	});

	it("runs light from lightest to darkest and dark the other way", () => {
		// `ink` is excluded on purpose: its solid is step 12, so steps 9 and 10
		// sit at the dark end and step 11 comes back lighter. That is what an
		// achromatic accent is, and check.ts exempts it for the same reason.
		for (const recipe of ALL_SCALES) {
			if (recipe.solidLightness === "contrast") continue;
			for (const mode of MODES) {
				const { steps } = resolveScale(recipe, mode);
				const lightness = steps.map(lightnessOf);
				const sorted = [...lightness].sort((a, b) =>
					mode === "light" ? b - a : a - b,
				);
				expect(lightness, `${recipe.name} ${mode}`).toEqual(sorted);
			}
		}
	});
});

describe("the solid at step 9", () => {
	it("is the authored brand colour, identical in both modes", () => {
		// Brand fidelity: a dapp's accent must be the same colour whichever theme
		// the visitor is in. Only the derived steps around it adapt.
		const green = scaleByName("green");
		expect(green.solidLightness).toBe(0.719);
		const light = stepOf(resolveScale(green, "light").steps, 9);
		const dark = stepOf(resolveScale(green, "dark").steps, 9);
		expect(lightnessOf(light)).toBeCloseTo(lightnessOf(dark), 6);
		expect(oklchCoords(light)).toEqual(oklchCoords(dark));
	});

	it("takes a per-mode value where the recipe gives a pair", () => {
		// Neutrals have no brand colour; their solid is a rung on the ladder, and
		// one number cannot be both darker than the light ladder's step 8 and
		// lighter than the dark ladder's.
		for (const recipe of NEUTRALS) {
			const solid = recipe.solidLightness;
			expect(typeof solid).toBe("object");
			if (typeof solid !== "object") continue;
			for (const mode of MODES) {
				const step9 = stepOf(resolveScale(recipe, mode).steps, 9);
				expect(lightnessOf(step9), `${recipe.name} ${mode}`).toBeCloseTo(
					solid[mode],
					2,
				);
			}
		}
	});

	it('falls back to step 12 when the recipe says "contrast"', () => {
		const ink = scaleByName("ink");
		expect(ink.solidLightness).toBe("contrast");
		for (const mode of MODES) {
			const { steps } = resolveScale(ink, mode);
			expect(oklchCoords(stepOf(steps, 9))).toEqual(
				oklchCoords(stepOf(steps, 12)),
			);
		}
	});
});

describe("the hovered solid at step 10", () => {
	it("darkens in light mode and lightens in dark", () => {
		for (const recipe of ACCENTS) {
			if (recipe.solidLightness === "contrast") continue;
			for (const mode of MODES) {
				const { steps } = resolveScale(recipe, mode);
				const solid = lightnessOf(stepOf(steps, 9));
				const hovered = lightnessOf(stepOf(steps, 10));
				const label = `${recipe.name} ${mode}`;
				if (mode === "light") expect(hovered, label).toBeLessThan(solid);
				else expect(hovered, label).toBeGreaterThan(solid);
			}
		}
	});
});

describe("solved steps", () => {
	const ladderFor = (mode: (typeof MODES)[number]) =>
		mode === "light" ? LIGHT_LADDER : DARK_LADDER;

	it("hit the contrast ratio the recipe asked for", () => {
		// The claim is that the solver lands on the target, not that it hits it
		// exactly. Two things move the result afterwards: the solve is numerical,
		// and the colour is then gamut-mapped into sRGB, which can lower chroma
		// and shift the ratio with it. The tolerance is relative rather than
		// absolute because that error scales with the target — an epsilon of 0.25
		// is 5% at a ratio of 4.8 and 2% at 12.
		//
		// 7% is the budget. The measured worst case across the whole palette is
		// 5.6% (`red`, dark, step 11), on the highest-chroma hue, which is where
		// gamut mapping takes the most away. The hard floor that actually matters
		// is asserted separately below and is not a tolerance at all.
		const tolerance = 0.93;
		for (const recipe of ALL_SCALES) {
			for (const mode of MODES) {
				const { steps } = resolveScale(recipe, mode);
				ladderFor(mode).forEach((strategy, index) => {
					if (strategy.kind !== "contrast") return;
					const solved = stepOf(steps, index + 1);
					const against = stepOf(steps, strategy.against);
					const actual = Math.abs(against.contrastWCAG21(solved));
					expect(
						actual,
						`${recipe.name} ${mode} step ${index + 1}`,
					).toBeGreaterThanOrEqual(strategy.ratio * tolerance);
				});
			}
		}
	});

	it("never solves a text step below the AA floor", () => {
		for (const recipe of ALL_SCALES) {
			for (const mode of MODES) {
				const { steps } = resolveScale(recipe, mode);
				// Step 11 is solved against step 3, the most contrasting background
				// it is ever rendered on. Steps 1 and 2 come free from that.
				for (const background of [1, 2, 3]) {
					const actual = Math.abs(
						stepOf(steps, background).contrastWCAG21(stepOf(steps, 11)),
					);
					expect(
						actual,
						`${recipe.name} ${mode} step 11 on ${background}`,
					).toBeGreaterThanOrEqual(4.5);
				}
			}
		}
	});
});

describe("accent foreground", () => {
	it("is dark on Bitcoin Cash green rather than white", () => {
		// The regression this exists to prevent: #0AC18E sits at 2.33:1 against
		// white, so a system that assumed white button labels would ship a
		// default that fails AA. RainbowKit had to delete a curated accent over
		// exactly this.
		const green = scaleByName("green");
		for (const mode of MODES) {
			const { steps, foreground } = resolveScale(green, mode);
			const solid = stepOf(steps, 9);
			expect(lightnessOf(foreground), mode).toBeLessThan(lightnessOf(solid));
			expect(
				Math.abs(solid.contrastWCAG21(foreground)),
				mode,
			).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("clears the text floor on every accent in both modes", () => {
		for (const recipe of ACCENTS) {
			for (const mode of MODES) {
				const { steps, foreground } = resolveScale(recipe, mode);
				const ratio = Math.abs(stepOf(steps, 9).contrastWCAG21(foreground));
				expect(ratio, `${recipe.name} ${mode}`).toBeGreaterThanOrEqual(4.5);
			}
		}
	});
});

describe("gamut", () => {
	it("keeps every step inside sRGB", () => {
		// Browsers have historically clipped out-of-gamut colours channel by
		// channel, which shifts hue. Mapping at generation time is what makes the
		// committed value the one that renders.
		for (const recipe of ALL_SCALES) {
			for (const mode of MODES) {
				const { steps, foreground, derived } = resolveScale(recipe, mode);
				for (const color of [...steps, foreground, ...derived.values()]) {
					expect(color.inGamut("srgb"), `${recipe.name} ${mode}`).toBe(true);
				}
			}
		}
	});
});

describe("determinism", () => {
	it("resolves the same colours on every run", () => {
		for (const recipe of ALL_SCALES) {
			for (const mode of MODES) {
				const first = resolveScale(recipe, mode).steps.map(oklchCoords);
				const second = resolveScale(recipe, mode).steps.map(oklchCoords);
				expect(second, `${recipe.name} ${mode}`).toEqual(first);
			}
		}
	});
});

describe("the semantic map", () => {
	it("only points at steps that exist", () => {
		for (const [token, source] of Object.entries(SEMANTIC)) {
			if (source.from === "accentForeground") continue;
			if (source.from === "accentDerived") continue;
			expect(source.step, token).toBeGreaterThanOrEqual(1);
			expect(source.step, token).toBeLessThanOrEqual(12);
		}
	});

	it("names a status scale that is actually generated", () => {
		const statusNames = new Set(STATUS.map((recipe) => recipe.name));
		for (const [token, source] of Object.entries(SEMANTIC)) {
			if (source.from === "accent" || source.from === "neutral") continue;
			if (source.from === "accentForeground") continue;
			if (source.from === "accentDerived") continue;
			expect(statusNames.has(source.from), token).toBe(true);
		}
	});
});

describe("accent pairing", () => {
	it("pairs every accent with a neutral that exists", () => {
		const neutralNames = new Set(NEUTRALS.map((recipe) => recipe.name));
		for (const accent of ACCENTS) {
			expect(neutralNames.has(accent.neutral), accent.name).toBe(true);
		}
	});

	it("spaces the chromatic accents far enough apart to tell apart", () => {
		// Two near-identical blues are a worse failure than a missing hue: the
		// curated set stops looking curated.
		const hues = ACCENTS.filter((accent) => accent.chroma > 0)
			.map((accent) => accent.hue)
			.sort((a, b) => a - b);
		for (let i = 1; i < hues.length; i++) {
			const previous = hues[i - 1];
			const current = hues[i];
			if (previous === undefined || current === undefined) continue;
			expect(current - previous, `${previous} to ${current}`).toBeGreaterThan(
				30,
			);
		}
	});
});
