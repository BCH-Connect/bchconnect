/**
 * The contrast gate.
 *
 * Run with `node packages/ui/tools/palette/check.ts`. Exits non-zero on any
 * failure, so it can block a merge.
 *
 * ## Why WCAG 2.x and not APCA
 *
 * WCAG 3.0 is a Working Draft whose own text says its contrast algorithm "is
 * yet to be determined", and APCA is not normatively referenced by any shipped
 * standard. What is actually binding — the EU's EN 301 549, the US ADA Title II
 * rule — is WCAG 2.x, and none of Primer, Carbon, Atlassian, Spectrum or
 * Material 3 gate on APCA. So the ratios are the gate. APCA Lc is computed and
 * printed beside them because it is the better perceptual signal and costs one
 * extra call, but it fails nothing.
 *
 * ## Why every accent is checked against every neutral
 *
 * Each accent ships with a paired neutral, but the pairing is a default a
 * developer may override, so the matrix is the full cross product rather than
 * the eight pairs we expect. A combination nobody on the team would choose is
 * still a combination someone will ship.
 */

import type Color from "colorjs.io";
import {
	lightnessOf,
	MODES,
	type Mode,
	type ResolvedScale,
	resolveScale,
} from "./palette.ts";
import { ACCENTS, NEUTRALS, type ScaleRecipe, STATUS } from "./recipes.ts";

/** WCAG 1.4.3, normal text. */
const TEXT_FLOOR = 4.5;

/** WCAG 1.4.11, non-text UI: focus rings and component boundaries. */
const NON_TEXT_FLOOR = 3;

interface Check {
	readonly combination: string;
	readonly token: string;
	readonly against: string;
	readonly floor: number;
	readonly ratio: number;
	readonly apca: number;
}

function ratio(foreground: Color, background: Color): number {
	return Math.abs(background.contrastWCAG21(foreground));
}

function apcaOf(foreground: Color, background: Color): number {
	return Math.abs(background.contrastAPCA(foreground));
}

function step(scale: ResolvedScale, index: number, label: string): Color {
	const color = scale.steps[index - 1];
	if (color === undefined) throw new Error(`${label} has no step ${index}.`);
	return color;
}

function check(
	combination: string,
	token: string,
	against: string,
	floor: number,
	foreground: Color,
	background: Color,
): Check {
	return {
		combination,
		token,
		against,
		floor,
		ratio: ratio(foreground, background),
		apca: apcaOf(foreground, background),
	};
}

/**
 * A scale whose lightness does not move in one direction has a step that reads
 * as out of order — a "hovered border" lighter than the border it hovers from,
 * or low-contrast text darker than the solid above it. The ladders are authored
 * to be monotonic; this is what stops a retuned ratio from silently breaking it.
 *
 * `ink` is checked only to step 8. Its solid is step 12 by definition, so steps
 * 9 and 10 sit at the dark end and step 11 comes back lighter. That is not a
 * defect, it is what an achromatic accent is: the solid and the text are the
 * same ink. Exempting it is derived from the recipe rather than hardcoded, so a
 * second achromatic accent would be covered without touching this.
 */
function monotonicFailures(
	name: string,
	scale: ResolvedScale,
	mode: Mode,
	recipe: ScaleRecipe,
): string[] {
	const failures: string[] = [];
	const descending = mode === "light";
	const last = recipe.solidLightness === "contrast" ? 8 : scale.steps.length;
	for (let i = 1; i < last; i++) {
		const previous = lightnessOf(step(scale, i, name));
		const current = lightnessOf(step(scale, i + 1, name));
		const wrong = descending
			? current > previous + 1e-6
			: current < previous - 1e-6;
		if (wrong) {
			failures.push(
				`${name} ${mode}: step ${i + 1} (${(current * 100).toFixed(1)}%) breaks the ` +
					`${descending ? "descending" : "ascending"} ladder after step ${i} ` +
					`(${(previous * 100).toFixed(1)}%)`,
			);
		}
	}
	return failures;
}

function checksFor(mode: Mode): { checks: Check[]; ladder: string[] } {
	const checks: Check[] = [];
	const ladder: string[] = [];

	const status = new Map<string, ResolvedScale>();
	for (const recipe of STATUS) {
		const resolved = resolveScale(recipe, mode);
		status.set(recipe.name, resolved);
		ladder.push(...monotonicFailures(recipe.name, resolved, mode, recipe));
	}

	for (const neutralRecipe of NEUTRALS) {
		const neutral = resolveScale(neutralRecipe, mode);
		ladder.push(
			...monotonicFailures(neutralRecipe.name, neutral, mode, neutralRecipe),
		);
	}

	for (const accentRecipe of ACCENTS) {
		const accent = resolveScale(accentRecipe, mode);
		ladder.push(
			...monotonicFailures(accentRecipe.name, accent, mode, accentRecipe),
		);

		// The solid's own foreground is a property of the accent alone.
		checks.push(
			check(
				`${accentRecipe.name} ${mode}`,
				"accent-foreground",
				"accent-9",
				TEXT_FLOOR,
				accent.foreground,
				step(accent, 9, accentRecipe.name),
			),
		);

		for (const neutralRecipe of NEUTRALS) {
			const neutral = resolveScale(neutralRecipe, mode);
			const label = `${accentRecipe.name}/${neutralRecipe.name} ${mode}`;
			const surface = step(neutral, 1, neutralRecipe.name);
			const raised = step(neutral, 2, neutralRecipe.name);

			checks.push(
				check(
					label,
					"text",
					"surface",
					TEXT_FLOOR,
					step(neutral, 12, neutralRecipe.name),
					surface,
				),
				check(
					label,
					"text-muted",
					"surface",
					TEXT_FLOOR,
					step(neutral, 11, neutralRecipe.name),
					surface,
				),
				check(
					label,
					"text-muted",
					"surface-raised",
					TEXT_FLOOR,
					step(neutral, 11, neutralRecipe.name),
					raised,
				),
				check(
					label,
					"accent-text",
					"surface",
					TEXT_FLOOR,
					step(accent, 11, accentRecipe.name),
					surface,
				),
				check(
					label,
					"accent-text",
					"accent-subtle",
					TEXT_FLOOR,
					step(accent, 11, accentRecipe.name),
					step(accent, 3, accentRecipe.name),
				),
			);

			const focus = accent.derived.get("focus");
			if (focus !== undefined) {
				checks.push(
					check(label, "focus", "surface", NON_TEXT_FLOOR, focus, surface),
				);
			}

			for (const [name, scale] of status) {
				checks.push(
					check(
						label,
						`${name}-text`,
						"surface",
						TEXT_FLOOR,
						step(scale, 11, name),
						surface,
					),
					check(
						label,
						`${name}-text`,
						`${name}-subtle`,
						TEXT_FLOOR,
						step(scale, 11, name),
						step(scale, 3, name),
					),
				);
			}
		}
	}

	return { checks, ladder };
}

function main(): void {
	const failures: Check[] = [];
	const ladderFailures: string[] = [];
	let total = 0;
	let worstText = Number.POSITIVE_INFINITY;

	for (const mode of MODES) {
		const { checks, ladder } = checksFor(mode);
		ladderFailures.push(...ladder);
		for (const item of checks) {
			total++;
			if (item.floor === TEXT_FLOOR)
				worstText = Math.min(worstText, item.ratio);
			if (item.ratio < item.floor) failures.push(item);
		}
	}

	for (const failure of ladderFailures) {
		process.stdout.write(`LADDER  ${failure}\n`);
	}

	for (const item of failures) {
		process.stdout.write(
			`FAIL    ${item.combination.padEnd(24)} ${item.token.padEnd(16)} on ${item.against.padEnd(16)} ` +
				`${item.ratio.toFixed(2)}:1 (floor ${item.floor}) — APCA Lc ${item.apca.toFixed(1)}\n`,
		);
	}

	const scales = ACCENTS.length + NEUTRALS.length + STATUS.length;
	process.stdout.write(
		`\n${total} contrast checks across ${ACCENTS.length} accents x ${NEUTRALS.length} neutrals x ${MODES.length} modes\n` +
			`${scales} scales checked for monotonic lightness\n` +
			`tightest text pair: ${worstText.toFixed(2)}:1 (floor ${TEXT_FLOOR})\n`,
	);

	if (failures.length > 0 || ladderFailures.length > 0) {
		process.stdout.write(
			`\n${failures.length} contrast failure(s), ${ladderFailures.length} ladder failure(s)\n`,
		);
		process.exitCode = 1;
		return;
	}
	process.stdout.write("\nAll clear.\n");
}

main();
