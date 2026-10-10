import {
	BCHC_ACCENTS,
	BCHC_BLURS,
	BCHC_FONTS,
	BCHC_NEUTRALS,
	BCHC_RADII,
	type BchcAccent,
	type BchcBlur,
	type BchcFont,
	type BchcNeutral,
	type BchcRadius,
} from "../src/theme.generated.ts";

/** Theme host attributes as story args; unset leaves the element's default. */
export interface ThemeArgs {
	readonly accent?: BchcAccent;
	readonly neutral?: BchcNeutral;
	readonly radius?: BchcRadius;
	readonly font?: BchcFont;
	// Not `blur`: story args are intersected with the element's own members, and `HTMLElement.blur()` collides.
	readonly backdropBlur?: BchcBlur;
}

function select(options: readonly string[]) {
	return { options, control: "select", table: { category: "theme" } } as const;
}

export const THEME_ARG_TYPES = {
	accent: select(BCHC_ACCENTS),
	neutral: select(BCHC_NEUTRALS),
	radius: select(BCHC_RADII),
	font: select(BCHC_FONTS),
	backdropBlur: select(BCHC_BLURS),
};
