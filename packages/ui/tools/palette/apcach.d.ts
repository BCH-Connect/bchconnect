/**
 * Ambient declarations for `apcach@0.6.4`, which ships no types of its own.
 *
 * Every signature here was transcribed from the installed source rather than
 * from documentation, per CLAUDE.md. Line references are into
 * `node_modules/apcach/index.js` at version 0.6.4:
 *
 * - `apcach`        L34   — note `colorSpace` defaults to `"p3"`, so callers
 *                           that need sRGB output must pass it explicitly.
 * - `crToBg`        L107  — `contrastModel` defaults to `"apca"`; the `"wcag"`
 *                           model is documented in README.md L191-209.
 * - `crToFg`        L129
 * - `maxChroma`     L204  — returns a resolver used in place of a chroma number.
 * - `apcachToCss`   L246  — the format switch enumerates the accepted strings.
 * - `calcContrast`  L278
 * - `inColorSpace`  L304
 *
 * Only the surface these tools use is declared. Anything else stays unknown
 * on purpose, so reaching for an undeclared export fails the typecheck instead
 * of silently widening.
 */
declare module "apcach" {
	/** Which contrast algorithm a target ratio is expressed in. */
	export type ContrastModel = "apca" | "wcag";

	/**
	 * Which side of the antagonist colour to search. `"auto"` lets apcach pick;
	 * the explicit directions force a lighter or darker result even when the
	 * opposite side would also satisfy the ratio.
	 */
	export type SearchDirection = "auto" | "lighter" | "darker";

	/** Gamut the solver is allowed to produce colours in. */
	export type ApcachColorSpace = "p3" | "srgb";

	/** Output formats accepted by {@link apcachToCss}. */
	export type CssFormat = "oklch" | "rgb" | "hex" | "p3" | "figma-p3";

	/** A solved contrast constraint: "hit this ratio against this colour". */
	export interface ContrastConfig {
		readonly bgColor: string;
		readonly fgColor: string;
		readonly cr: number;
		readonly contrastModel: ContrastModel;
		readonly searchDirection: SearchDirection;
	}

	/** A colour whose lightness was solved to satisfy its {@link ContrastConfig}. */
	export interface ApcachColor {
		readonly alpha: number;
		readonly chroma: number;
		readonly colorSpace: ApcachColorSpace;
		readonly contrastConfig: ContrastConfig;
		readonly hue: number;
		/** Normalised 0-1, not a percentage. */
		readonly lightness: number;
	}

	/**
	 * What {@link maxChroma} returns: a resolver apcach calls in place of a
	 * fixed chroma, so the chroma is pushed as high as the gamut allows.
	 */
	export type ChromaResolver = (
		contrastConfig: ContrastConfig,
		hue: number,
		alpha: number,
		colorSpace: ApcachColorSpace,
	) => ApcachColor;

	export function apcach(
		contrast: ContrastConfig,
		chroma: number | ChromaResolver,
		hue: number,
		alpha?: number,
		colorSpace?: ApcachColorSpace,
	): ApcachColor;

	export function crToBg(
		bgColor: string,
		cr: number,
		contrastModel?: ContrastModel,
		searchDirection?: SearchDirection,
	): ContrastConfig;

	export function crToFg(
		fgColor: string,
		cr: number,
		contrastModel?: ContrastModel,
		searchDirection?: SearchDirection,
	): ContrastConfig;

	export function maxChroma(chromaCap?: number): ChromaResolver;

	export function apcachToCss(color: ApcachColor, format: CssFormat): string;

	export function calcContrast(
		fgColor: string,
		bgColor: string,
		contrastModel?: ContrastModel,
		colorSpace?: ApcachColorSpace,
	): number;

	export function inColorSpace(
		color: ApcachColor | string,
		colorSpace?: ApcachColorSpace,
	): boolean;
}
