/**
 * The BCH Connect colour system, expressed as data.
 *
 * Nothing in this file is a colour value a designer eyeballed into place. Every
 * scale is a recipe: a hue, a chroma ceiling, one authored solid, and a ladder
 * that says how the other eleven steps are derived from it. `generate.ts` turns
 * these recipes into CSS; `check.ts` proves the result meets WCAG 2.2 AA.
 *
 * ## Why twelve steps
 *
 * The step semantics are Radix Colors'. We took the contract, not the colours:
 * a component writes `var(--bchc-accent-3)` for a resting surface and
 * `var(--bchc-accent-4)` for its hover exactly once, and it is then correct for
 * every accent, in both modes, forever. Adding a ninth accent adds no component
 * CSS at all. That is the whole reason a closed, curated set stays maintainable
 * as it grows.
 *
 * ## Which steps are solved rather than drawn
 *
 * Steps 11 and 12 are *solved* for a contrast ratio against step 3 rather than
 * placed on a lightness curve, so their contrast is structural:
 *
 * - step 11 — body and label text, solved to clear WCAG 1.4.3 (4.5:1).
 * - step 12 — primary text, solved well past the floor.
 *
 * They are solved against step 3, not step 2, because step 3 is the most
 * contrasting background these ever land on: `accent-text` is used on
 * `accent-subtle`, which is step 3. Solving against step 2 — which is what
 * Radix guarantees — leaves the pair at roughly 4.4:1 once it is actually
 * rendered on step 3, which is a failure. Satisfying step 3 satisfies steps 1
 * and 2 for free.
 *
 * Targets sit deliberately above the floor they are gated at (4.8 against a 4.5
 * gate). The Pen prototype is the cautionary tale: its `a2-accent-text` landed
 * at 4.41 and its `a2-text-subtle` at 3.09, both of which read fine to the eye
 * and both of which fail AA.
 *
 * Step 9 is the one authored colour in each scale — the brand solid itself.
 * Everything else is derived from it.
 *
 * ## Why focus is not a step
 *
 * The focus ring needs 3:1 against the surface (WCAG 1.4.11), and no step in
 * this ladder is positioned to provide it: step 7 is a *light* border in Radix's
 * scheme, and solving it for 3:1 drags it darker than the solid at step 9,
 * which breaks the ladder's monotonic lightness and makes "hovered border" at
 * step 8 lighter than the border it hovers from. Focus is therefore its own
 * solved value in {@link ACCENT_DERIVED}, off the ladder, with its own
 * constraint. A focus ring that fails contrast is an accessibility defect
 * rather than a style preference, so it is not left to a curve.
 *
 * @see ./generate.ts for how a recipe becomes CSS
 * @see ./check.ts for the gate
 */

import type { SearchDirection } from "apcach";

/** Steps are 1-12; this names the type so signatures read honestly. */
export type Step = number;

/**
 * How one step of a scale gets its lightness and chroma.
 *
 * `curve` steps are drawn on an authored lightness ladder, and the ladder is
 * monotonic: light mode runs from lightest at step 1 to darkest at step 12, dark
 * mode the other way. `solid` is the one authored brand colour. `contrast` and
 * `shift` are resolved relative to steps that already exist, so a hue change
 * carries through instead of leaving a stale hardcoded value behind.
 */
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

/**
 * Light mode, step 1 (lightest) to step 12 (darkest).
 *
 * Chroma rises through the backgrounds so a tinted surface stays visibly
 * related to its accent without ever competing with content, peaks at the solid,
 * and falls again at step 12 because heavily saturated body text reads as a
 * mistake rather than as brand.
 */
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

/**
 * Dark mode, step 1 (darkest) to step 12 (lightest).
 *
 * Not an inversion of the light ladder. Dark surfaces need more chroma to read
 * as tinted at all, and step 11 is solved at 9:1 rather than 4.8:1 so that it
 * lands *lighter* than the hovered solid at step 10 — the ordering Radix's dark
 * scales have and the light ones do not. Solving it at the bare AA floor would
 * put "low-contrast text" below the solid and invert the scale's own hierarchy;
 * `check.ts` gates on monotonic lightness so that cannot regress unnoticed.
 */
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

/**
 * A value solved against a step but kept off the ladder, because the constraint
 * it has to satisfy does not belong to any position in the twelve-step scale.
 */
export interface DerivedRecipe {
	readonly name: string;
	readonly ratio: number;
	readonly against: Step;
	readonly chromaScale: number;
}

/**
 * Off-ladder accent values.
 *
 * `focus` is solved to clear WCAG 1.4.11 (3:1 for non-text UI) against step 1,
 * the surface a ring is actually drawn on, with margin over the 3.0 gate. It
 * lives here rather than at step 7 because forcing a ladder step to carry a
 * contrast constraint broke the ladder's monotonic lightness — see the note at
 * the top of this file.
 */
export const ACCENT_DERIVED: readonly DerivedRecipe[] = [
	{ name: "focus", ratio: 3.4, against: 1, chromaScale: 0.9 },
];

/** The neutral families an accent can sit on. */
export type NeutralName = "sage" | "slate" | "sand" | "pure";

/**
 * A hue recipe. `chroma` is a ceiling, not a promise: `generate.ts` clamps it
 * into sRGB per step, because maximum available chroma varies by hue and by
 * lightness, and browsers have historically clipped out-of-gamut colours in a
 * way that shifts hue rather than reducing chroma.
 */
export interface ScaleRecipe {
	readonly name: string;
	readonly hue: number;
	readonly chroma: number;
	/**
	 * The authored step 9, as OKLCH lightness.
	 *
	 * A single number means the solid is the same in both modes, which is what a
	 * brand colour wants: `#0AC18E` stays `#0AC18E` so a dapp's accent is the
	 * same colour whichever theme the visitor is in.
	 *
	 * A `{ light, dark }` pair is for scales whose solid is a position on the
	 * ladder rather than a brand, i.e. the neutrals — a single value there
	 * would have to be simultaneously darker than the light ladder's step 8 and
	 * lighter than the dark ladder's, which nothing can be.
	 *
	 * `"contrast"` means the scale has no solid of its own and takes step 12:
	 * the achromatic `ink` accent, near-black on light and near-white on dark.
	 */
	readonly solidLightness:
		| number
		| { readonly light: number; readonly dark: number }
		| "contrast";
}

/** An accent, plus the neutral family it is paired with by default. */
export interface AccentRecipe extends ScaleRecipe {
	readonly neutral: NeutralName;
}

/**
 * The eight curated accents, spaced roughly 45 degrees apart in OKLCH hue so
 * that no two can be confused for one another. Coverage was chosen against
 * where brand colours actually cluster: blue is the single most common brand
 * hue among the largest companies, red is second, violet is the crypto default,
 * and `ink` exists because monochrome brands otherwise have nowhere to go.
 *
 * `green` is the default and is Bitcoin Cash's official `#0AC18E`
 * (`oklch(0.719 0.149 165.6)`). Worth knowing: Pen direction `a` had already
 * landed on `#14C08A`, the same colour to two decimals. Direction `a2` then
 * drifted it brighter and yellower to `oklch(0.770 0.189 152.6)`, which is
 * where its 1.93:1 contrast against white came from.
 *
 * Every solid here is a *background* colour. None of them is assumed to carry
 * white text — `generate.ts` solves each one's foreground independently,
 * because BCH green sits at 2.33:1 against white and would fail outright.
 * RainbowKit shipped a curated set of seven accents and still had to delete
 * yellow post-release for exactly this reason.
 */
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
	// 0.74 rather than 0.78: above that the solid lands within a hair of where
	// its own step 11 solves in dark mode, so the button and the text on the
	// surface beside it read as the same value.
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

/**
 * The neutrals, carrying a deliberately tiny chroma at the hue family of the
 * accents they pair with.
 *
 * Radix's own justification for pairing a tinted gray to an accent is purely
 * aesthetic — "the difference is subtle", their words — with no accessibility
 * claim attached. That is why the pairing above is a default rather than a law:
 * a taste default is exactly the kind a developer should be able to override,
 * and the neutral is over ninety percent of the modal's pixels.
 *
 * Four to start, not Radix's six. Any that cannot justify itself once the lab
 * renders them side by side gets cut.
 */
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

/**
 * Status hues. These are fixed and are never themed.
 *
 * There is no `success` scale, and its absence is the design decision: success
 * *is* the accent. The only success this product has is "connected", confirming
 * is already what the accent means, and two greens on one screen is worse than
 * one green. The check mark and the copy carry the semantics; the hue does not
 * have to. Pen had the same instinct — `a2-success` was set equal to
 * `a2-accent-text` — and the lab later broke it by inventing a second,
 * almost-but-not-quite-identical green at `#1FC078`.
 *
 * Warning and danger stay fixed precisely because they must never inherit a
 * brand colour: a destructive state rendered in the dapp's accent is a lie.
 */
export const STATUS: readonly ScaleRecipe[] = [
	{ name: "warning", hue: 70, chroma: 0.15, solidLightness: 0.76 },
	// Same reason as amber, in light mode: at 0.58 the destructive solid and
	// `danger-text` collapse onto one value.
	{ name: "danger", hue: 25, chroma: 0.19, solidLightness: 0.62 },
];

/**
 * The connection code's own two colours, fixed in both themes.
 *
 * The code is a machine-readable object, not a brand surface. A light-on-dark
 * code is valid by the spec and plenty of scanners still fail on it, so it
 * stays dark-on-light whatever the modal around it is doing — the tile becomes
 * a white plate on a dark card rather than the code inverting.
 *
 * The ink carries a whisper of the sage hue so it belongs to this palette
 * rather than being stray pure black, and still clears 19:1 against the paper.
 */
export const CODE: { readonly ink: string; readonly paper: string } = {
	ink: "#101312",
	paper: "#ffffff",
};

/**
 * Alpha applied to the neutral's step 12 to make the overlay and shadows.
 * Authored per mode because a dark modal needs a heavier scrim to separate from
 * a dark page than a light one does.
 */
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

/**
 * The radius presets, as an explicit value per role rather than one ramp
 * multiplied by a scalar.
 *
 * The multiplier approach is what the lab shipped and it is wrong for the same
 * reason Radix gives: "the resulting border-radius is contextual and differs
 * depending on the component". A scalar that pills a button balloons the modal
 * card — at the lab's `full` (2.2x) the 28px card became 61.6px. A table costs
 * more authored values and every one of them was actually decided.
 */
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
	// `full` pills every control and rounds the card hard, but stops the card
	// short of the blob a pure multiplier produces, and keeps logo wells square
	// enough that a wallet mark is still recognisable.
	full: { modal: 36, tile: 28, row: 999, control: 999, pill: 999, media: 12 },
};

/**
 * Backdrop blur behind the modal.
 *
 * A knob rather than a fixed value because it is the one purely atmospheric
 * choice in the system: a dapp with a busy page wants the scrim to do more
 * work, and one with a quiet page wants it to do less. Neither is wrong.
 */
export type BlurPreset = "none" | "small" | "large";

export const OVERLAY_BLUR: Readonly<Record<BlurPreset, number>> = {
	none: 0,
	small: 8,
	large: 24,
};

/**
 * Font stacks.
 *
 * `brand` resolves through `--bchc-font-brand-family`, which the library sets
 * when it injects its `@font-face` at document level — Shadow DOM cannot
 * declare fonts, so the face has to be registered outside it. Until a face is
 * chosen the fallback applies and `brand` renders identically to `system`,
 * which is deliberate: the layout must survive the fallback anyway, so the
 * fallback is what gets designed against first.
 *
 * The brand face itself is still an open decision.
 */
export type FontPreset = "brand" | "system" | "mono";

const SYSTEM_STACK =
	'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const FONT_STACKS: Readonly<Record<FontPreset, string>> = {
	brand: `var(--bchc-font-brand-family, ${SYSTEM_STACK})`,
	system: SYSTEM_STACK,
	mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
};

/** Where a semantic token gets its value from. */
export type SemanticSource =
	| { readonly from: "accent"; readonly step: Step }
	| { readonly from: "neutral"; readonly step: Step }
	| { readonly from: "warning"; readonly step: Step }
	| { readonly from: "danger"; readonly step: Step }
	| { readonly from: "accentForeground" }
	| { readonly from: "accentDerived"; readonly name: string };

/**
 * The documented public surface: the semantic custom properties a dapp may set
 * directly, and what each one resolves to in the generated palette.
 *
 * These are versioned API. CSS custom properties inherit through a shadow
 * boundary whether we document them or not, so the door is open either way —
 * the only choice is whether what is behind it is a supported surface or a set
 * of private names we are free to break. Reown AppKit exposes eight variables
 * and no escape hatch, and has a long-running issue thread from developers who
 * cannot reach their brand colour without making the modal's text invisible.
 *
 * Note there are two text levels, not three. Pen had `text`, `text-muted` and
 * `text-subtle`, and `a2-text-subtle` failed AA at 3.09:1. Three greys where
 * two greys plus a weight change would do is a typography smell, and dropping
 * the third removes the failing token structurally rather than nudging it.
 */
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
	// Solved for 3:1 against the surface, so a visible focus ring is guaranteed
	// for every accent rather than hoped for.
	focus: { from: "accentDerived", name: "focus" },
	warningSubtle: { from: "warning", step: 3 },
	warningBorder: { from: "warning", step: 7 },
	warningText: { from: "warning", step: 11 },
	dangerSubtle: { from: "danger", step: 3 },
	dangerBorder: { from: "danger", step: 7 },
	danger: { from: "danger", step: 9 },
	dangerText: { from: "danger", step: 11 },
};
