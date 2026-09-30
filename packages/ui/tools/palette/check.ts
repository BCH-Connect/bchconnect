// The contrast gate; exits non-zero on failure, so it can block a merge.
// WCAG 2.x ratios are the pass/fail floor (what EN 301 549 / ADA Title II
// actually bind to); APCA Lc is printed alongside but fails nothing. Every
// accent is checked against every neutral, not only its paired default,
// since the pairing is overridable.

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

// Catches a retuned ratio silently breaking the ladders' monotonic lightness.
// `ink` is checked only to step 8: its solid is step 12 by definition, so 9-11
// aren't monotonic by design. Derived from the recipe, not hardcoded to "ink".
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
