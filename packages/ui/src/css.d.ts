/**
 * CSS module scripts.
 *
 * `import sheet from "./modal.css" with { type: "css" }` is a platform feature
 * — it yields a real `CSSStyleSheet` that a shadow root can adopt — but
 * TypeScript has no built-in knowledge of it, so the module shape is declared
 * here. This is the mechanism the shipped library uses to get its styles into
 * the shadow root without a bundler, a string literal, or a `<link>` that would
 * leave the modal unstyled for a frame.
 */
declare module "*.css" {
	const sheet: CSSStyleSheet;
	export default sheet;
}
