/** Type-level helpers used by the protocol fixtures. */

/**
 * Flattens an intersection into a single object literal for display.
 * Purely cosmetic at the type level - it changes hover output, not assignability.
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Classic contravariant-inference fold. Turns `A | B` into `A & B`. */
type UnionToIntersection<U> = (
	U extends unknown
		? (arg: U) => void
		: never
) extends (arg: infer I) => void
	? I
	: never;

/**
 * `UnionToIntersection<never>` is `never`, which would annihilate any map it is
 * intersected into. The zero-extension case must fold to `unknown` (the
 * identity for `&`) instead, so `Base & MergeAll<[]>` stays `Base`.
 */
export type MergeAll<U> = [U] extends [never]
	? unknown
	: UnionToIntersection<U>;
