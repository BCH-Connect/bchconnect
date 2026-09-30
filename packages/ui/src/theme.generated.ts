/**
 * GENERATED FILE - do not edit by hand.
 *
 * Source of truth: tools/palette/recipes.ts
 * Regenerate:      node packages/ui/tools/palette/generate.ts
 *
 * Every value here is closed on purpose: picking from these, instead of a raw
 * colour, is what lets the system guarantee contrast. Each maps to a
 * `data-bchc-*` attribute on the modal host; the matching declarations live
 * in `styles/theme.generated.css`.
 */

/**
 * Curated accents. `ink` is achromatic, for monochrome brands.
 *
 * @beta
 */
export type BchcAccent = "green" | "cyan" | "blue" | "violet" | "pink" | "red" | "amber" | "ink";

/**
 * Neutral families. Each accent is paired with one by default, so this is an
 * override rather than a required choice.
 *
 * @beta
 */
export type BchcNeutral = "sage" | "slate" | "sand" | "pure";

/**
 * Radius presets. Each maps to an explicit value per role, not a multiplier.
 *
 * @beta
 */
export type BchcRadius = "none" | "small" | "medium" | "large" | "full";

/**
 * Font stacks. `brand` falls back to `system` until a face is injected.
 *
 * @beta
 */
export type BchcFont = "brand" | "system" | "mono";

/**
 * Backdrop blur behind the modal.
 *
 * @beta
 */
export type BchcBlur = "none" | "small" | "large";

/**
 * `auto` follows `prefers-color-scheme`.
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
	"green",
	"cyan",
	"blue",
	"violet",
	"pink",
	"red",
	"amber",
	"ink",
] as const;

/**
 * The values of {@link BchcNeutral}, in display order.
 *
 * @beta
 */
export const BCHC_NEUTRALS = [
	"sage",
	"slate",
	"sand",
	"pure",
] as const;

/**
 * The values of {@link BchcRadius}, in display order.
 *
 * @beta
 */
export const BCHC_RADII = [
	"none",
	"small",
	"medium",
	"large",
	"full",
] as const;

/**
 * The values of {@link BchcFont}, in display order.
 *
 * @beta
 */
export const BCHC_FONTS = [
	"brand",
	"system",
	"mono",
] as const;

/**
 * The values of {@link BchcBlur}, in display order.
 *
 * @beta
 */
export const BCHC_BLURS = [
	"none",
	"small",
	"large",
] as const;

/**
 * Which neutral each accent is paired with by default.
 *
 * The pairing cannot live in CSS: a stylesheet can declare
 * `--bchc-neutral-family` but nothing can select on a custom property's
 * value, so whoever sets the theme attributes has to resolve it. Radix frames
 * the pairing as aesthetic rather than accessible — "the difference is subtle",
 * their words — which is why it is a default here and `data-bchc-neutral`
 * overrides it.
 *
 * @beta
 */
export const BCHC_ACCENT_DEFAULT_NEUTRAL: Readonly<Record<BchcAccent, BchcNeutral>> = {
	green: "sage",
	cyan: "sage",
	blue: "slate",
	violet: "slate",
	pink: "slate",
	red: "sand",
	amber: "sand",
	ink: "pure",
};

/**
 * The accent applied when a caller sets no `data-bchc-accent` attribute.
 *
 * @beta
 */
export const BCHC_DEFAULT_ACCENT: BchcAccent = "green";

/**
 * The neutral applied when a caller sets no `data-bchc-neutral` attribute.
 *
 * @beta
 */
export const BCHC_DEFAULT_NEUTRAL: BchcNeutral = "sage";
