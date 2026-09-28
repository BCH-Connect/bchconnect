// Colour recipes for the palette; generate.ts builds theme.generated.{css,ts}
// and check.ts verifies WCAG 2.2 AA against these. Twelve steps per scale
// (Radix's step contract); step 9 is the authored solid, the rest derive from
// it. Steps 11/12 are solved for contrast against step 3. Focus is solved
// off-ladder (3:1, WCAG 1.4.11): no ladder step can reach it without breaking
// the lightness order.

import type { SearchDirection } from "apcach";

export type Step = number;

// `contrast`/`shift` resolve relative to existing steps, so a hue change
// carries through instead of leaving a stale hardcoded value.
export type StepStrategy =
	| {
			readonly kind: "curve";
			readonly lightness: number;
			readonly chromaScale: number;
	  }
	| { readonly kind: "solid" }
	| {
			readonly kind: "contrast";
			readonly ratio: number;
			readonly against: Step;
			readonly chromaScale: number;
			readonly direction: SearchDirection;
	  }
	| {
			readonly kind: "shift";
			readonly from: Step;
			readonly deltaLightness: number;
			readonly chromaScale: number;
	  };

/** The twelve Radix roles, kept next to the ladders they govern. */
export const STEP_ROLES: readonly string[] = [
	"app background",
	"subtle background",
	"UI element background",
	"hovered UI element background",
	"active / selected UI element background",
	"subtle border",
	"UI element border",
	"hovered UI element border",
	"solid",
	"hovered solid",
	"low-contrast text",
	"high-contrast text",
];

// Step 1 (lightest) to 12 (darkest). Chroma rises through the backgrounds,
// peaks at the solid, then falls at step 12 (saturated body text reads as a mistake).
export const LIGHT_LADDER: readonly StepStrategy[] = [
	{ kind: "curve", lightness: 0.993, chromaScale: 0.06 },
	{ kind: "curve", lightness: 0.98, chromaScale: 0.14 },
	{ kind: "curve", lightness: 0.958, chromaScale: 0.26 },
	{ kind: "curve", lightness: 0.933, chromaScale: 0.38 },
	{ kind: "curve", lightness: 0.905, chromaScale: 0.5 },
	{ kind: "curve", lightness: 0.87, chromaScale: 0.62 },
	{ kind: "curve", lightness: 0.828, chromaScale: 0.75 },
	{ kind: "curve", lightness: 0.78, chromaScale: 0.88 },
	{ kind: "solid" },
	{ kind: "shift", from: 9, deltaLightness: -0.045, chromaScale: 1 },
	{
		kind: "contrast",
		ratio: 4.8,
		against: 3,
		chromaScale: 1,
		direction: "darker",
	},
	{
		kind: "contrast",
		ratio: 12,
		against: 3,
		chromaScale: 0.55,
		direction: "darker",
	},
];

// Step 1 (darkest) to 12 (lightest); not an inversion of the light ladder.
// Step 11 is solved at 9:1, not 4.8:1, so it lands lighter than the hovered
// solid at step 10; check.ts gates on monotonic lightness so this can't regress.
export const DARK_LADDER: readonly StepStrategy[] = [
	{ kind: "curve", lightness: 0.178, chromaScale: 0.18 },
	{ kind: "curve", lightness: 0.212, chromaScale: 0.28 },
	{ kind: "curve", lightness: 0.253, chromaScale: 0.44 },
	{ kind: "curve", lightness: 0.29, chromaScale: 0.58 },
	{ kind: "curve", lightness: 0.328, chromaScale: 0.68 },
	{ kind: "curve", lightness: 0.378, chromaScale: 0.76 },
	{ kind: "curve", lightness: 0.44, chromaScale: 0.9 },
	{ kind: "curve", lightness: 0.53, chromaScale: 0.95 },
	{ kind: "solid" },
	{ kind: "shift", from: 9, deltaLightness: 0.045, chromaScale: 1 },
	{
		kind: "contrast",
		ratio: 9,
		against: 3,
		chromaScale: 1,
		direction: "lighter",
	},
	{
		kind: "contrast",
		ratio: 13,
		against: 3,
		chromaScale: 0.45,
		direction: "lighter",
	},
];

export interface DerivedRecipe {
	readonly name: string;
	readonly ratio: number;
	readonly against: Step;
	readonly chromaScale: number;
}

// `focus` clears WCAG 1.4.11 (3:1) against step 1, the surface a ring is
// drawn on; kept off-ladder because forcing it onto a step broke monotonic lightness.
export const ACCENT_DERIVED: readonly DerivedRecipe[] = [
	{ name: "focus", ratio: 3.4, against: 1, chromaScale: 0.9 },
];

export type NeutralName = "sage" | "slate" | "sand" | "pure";

// `chroma` is a ceiling, not a promise: generate.ts clamps it into sRGB per
// step, since max available chroma varies by hue and lightness.
export interface ScaleRecipe {
	readonly name: string;
	readonly hue: number;
	readonly chroma: number;
	// A number: same solid in both modes (a brand colour, e.g. `#0AC18E`).
	// `{ light, dark }`: solid is a ladder position, not a brand (the neutrals).
	// `"contrast"`: no solid of its own, takes step 12 (the achromatic `ink` accent).
	readonly solidLightness:
		| number
		| { readonly light: number; readonly dark: number }
		| "contrast";
}

export interface AccentRecipe extends ScaleRecipe {
	readonly neutral: NeutralName;
}

// Eight accents ~45deg apart in hue so none are confused; `green` is BCH's
// official #0AC18E. Every solid is a background colour; generate.ts solves
// each foreground independently (BCH green is only 2.33:1 against white).
export const ACCENTS: readonly AccentRecipe[] = [
	{
		name: "green",
		hue: 165.6,
		chroma: 0.149,
		solidLightness: 0.719,
		neutral: "sage",
	},
	{
		name: "cyan",
		hue: 215,
		chroma: 0.13,
		solidLightness: 0.7,
		neutral: "sage",
	},
	{
		name: "blue",
		hue: 262,
		chroma: 0.19,
		solidLightness: 0.62,
		neutral: "slate",
	},
	{
		name: "violet",
		hue: 298,
		chroma: 0.21,
		solidLightness: 0.6,
		neutral: "slate",
	},
	{
		name: "pink",
		hue: 345,
		chroma: 0.2,
		solidLightness: 0.66,
		neutral: "slate",
	},
	{
		name: "red",
		hue: 25,
		chroma: 0.205,
		solidLightness: 0.62,
		neutral: "sand",
	},
	// 0.74, not 0.78: above that the solid nears its own step 11 in dark mode.
	{
		name: "amber",
		hue: 75,
		chroma: 0.16,
		solidLightness: 0.74,
		neutral: "sand",
	},
	{
		name: "ink",
		hue: 0,
		chroma: 0,
		solidLightness: "contrast",
		neutral: "pure",
	},
];

// Tiny chroma at the paired accent's hue family; a default, overridable with
// `data-bchc-neutral`.
export const NEUTRALS: readonly ScaleRecipe[] = [
	{
		name: "sage",
		hue: 165,
		chroma: 0.016,
		solidLightness: { light: 0.62, dark: 0.6 },
	},
	{
		name: "slate",
		hue: 262,
		chroma: 0.018,
		solidLightness: { light: 0.62, dark: 0.6 },
	},
	{
		name: "sand",
		hue: 75,
		chroma: 0.016,
		solidLightness: { light: 0.62, dark: 0.6 },
	},
	{
		name: "pure",
		hue: 0,
		chroma: 0,
		solidLightness: { light: 0.62, dark: 0.6 },
	},
];

// Fixed, never themed. No `success` scale: the accent already means
// confirmed. Warning/danger stay fixed since a destructive state in the
// dapp's own accent would be misleading.
export const STATUS: readonly ScaleRecipe[] = [
	{ name: "warning", hue: 70, chroma: 0.15, solidLightness: 0.76 },
	// Same reason as amber: at 0.58 the solid and danger-text collapse together.
	{ name: "danger", hue: 25, chroma: 0.19, solidLightness: 0.62 },
];

// Fixed in both themes: many scanners fail on light-on-dark codes, so this
// stays dark-on-light regardless of the modal's own theme.
export const CODE: {
	readonly foreground: string;
	readonly background: string;
} = {
	foreground: "#101312",
	background: "#ffffff",
};

// Alpha on the neutral's step 12; authored per mode since a dark modal needs
// a heavier scrim against a dark page.
export interface VeilRecipe {
	readonly overlay: number;
	readonly shadowSoft: number;
	readonly shadowTight: number;
}

export const LIGHT_VEIL: VeilRecipe = {
	overlay: 0.55,
	shadowSoft: 0.08,
	shadowTight: 0.04,
};

export const DARK_VEIL: VeilRecipe = {
	overlay: 0.65,
	shadowSoft: 0.4,
	shadowTight: 0.25,
};

// Explicit value per role, not one ramp times a scalar: a factor that pills
// a button would balloon the modal card.
export type RadiusPreset = "none" | "small" | "medium" | "large" | "full";

export interface RadiusRow {
	/** The modal card itself, and the mobile sheet's top corners. */
	readonly modal: number;
	/** The QR tile and other large inset panels. */
	readonly tile: number;
	/** Wallet rows and list items. */
	readonly row: number;
	/** Buttons and the session-type control. */
	readonly control: number;
	/** Pills: the network badge, the copy chip. */
	readonly pill: number;
	/** Wallet logos and other small inset media. */
	readonly media: number;
}

export const RADIUS: Readonly<Record<RadiusPreset, RadiusRow>> = {
	none: { modal: 0, tile: 0, row: 0, control: 0, pill: 0, media: 0 },
	small: { modal: 8, tile: 6, row: 4, control: 6, pill: 6, media: 4 },
	medium: { modal: 20, tile: 16, row: 10, control: 10, pill: 999, media: 8 },
	large: { modal: 28, tile: 24, row: 14, control: 14, pill: 999, media: 10 },
	// `full` pills controls and rounds the card hard, but keeps logo wells square
	// enough that a wallet mark stays recognisable.
	full: { modal: 36, tile: 28, row: 999, control: 999, pill: 999, media: 12 },
};

// A knob, not a fixed value: a busy page behind the modal wants more obscured.
export type BlurPreset = "none" | "small" | "large";

export const OVERLAY_BLUR: Readonly<Record<BlurPreset, number>> = {
	none: 0,
	small: 8,
	large: 24,
};

// `brand` resolves through --bchc-font-brand-family, set when the library
// injects @font-face at document level (Shadow DOM can't declare fonts).
export type FontPreset = "brand" | "system" | "mono";

const SYSTEM_STACK =
	'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const FONT_STACKS: Readonly<Record<FontPreset, string>> = {
	brand: `var(--bchc-font-brand-family, ${SYSTEM_STACK})`,
	system: SYSTEM_STACK,
	mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
};

export type SemanticSource =
	| { readonly from: "accent"; readonly step: Step }
	| { readonly from: "neutral"; readonly step: Step }
	| { readonly from: "warning"; readonly step: Step }
	| { readonly from: "danger"; readonly step: Step }
	| { readonly from: "accentForeground" }
	| { readonly from: "accentDerived"; readonly name: string };

// Versioned API, kept small: two text levels (text, textMuted), not three —
// a third grey is better expressed as a font-weight change than a new token.
export const SEMANTIC: Readonly<Record<string, SemanticSource>> = {
	surface: { from: "neutral", step: 1 },
	surfaceRaised: { from: "neutral", step: 2 },
	surfaceSunken: { from: "neutral", step: 3 },
	surfaceHover: { from: "neutral", step: 4 },
	surfaceActive: { from: "neutral", step: 5 },
	borderSubtle: { from: "neutral", step: 6 },
	border: { from: "neutral", step: 7 },
	borderHover: { from: "neutral", step: 8 },
	textMuted: { from: "neutral", step: 11 },
	text: { from: "neutral", step: 12 },
	accentSubtle: { from: "accent", step: 3 },
	accentSubtleHover: { from: "accent", step: 4 },
	accentSubtleActive: { from: "accent", step: 5 },
	accentBorder: { from: "accent", step: 7 },
	accent: { from: "accent", step: 9 },
	accentHover: { from: "accent", step: 10 },
	accentText: { from: "accent", step: 11 },
	accentForeground: { from: "accentForeground" },
	// 3:1 against the surface (WCAG 1.4.11): every accent's focus ring clears it.
	focus: { from: "accentDerived", name: "focus" },
	warningSubtle: { from: "warning", step: 3 },
	warningBorder: { from: "warning", step: 7 },
	warningText: { from: "warning", step: 11 },
	dangerSubtle: { from: "danger", step: 3 },
	dangerBorder: { from: "danger", step: 7 },
	danger: { from: "danger", step: 9 },
	dangerText: { from: "danger", step: 11 },
};
