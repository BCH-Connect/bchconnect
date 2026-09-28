/**
 * `linear()` easing is unparseable before Safari 17.2, and WAAPI's
 * `.animate()` throws on an unparseable `easing` string — see `tempoOf()` in
 * motion.ts, which reads these tokens straight off the stylesheet. This
 * guards the one invariant that matters for that: outside the `@supports`
 * gate, none of the `--bchc-ease-*` tokens may resolve to a `linear()` value.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(HERE, "..", "src", "styles", "tokens.css");

/** The block's `{ ... }` body, matched by brace counting so formatting can't throw it off. */
function bodyOf(css: string, headerIndex: number): string {
	const open = css.indexOf("{", headerIndex);
	if (open === -1) throw new Error("no opening brace found");
	let depth = 0;
	for (let index = open; index < css.length; index += 1) {
		if (css[index] === "{") depth += 1;
		else if (css[index] === "}") {
			depth -= 1;
			if (depth === 0) return css.slice(open + 1, index);
		}
	}
	throw new Error("no matching closing brace found");
}

describe("--bchc-ease-* tokens", () => {
	it("default to something other than linear() outside @supports", async () => {
		const css = await readFile(TOKENS, "utf8");
		const headerIndex = css.indexOf(":where(:root, :host) {");
		expect(headerIndex).toBeGreaterThan(-1);
		// The base block, before any `@supports`/`@media` override reassigns them.
		const base = bodyOf(css, headerIndex);
		const eases = [...base.matchAll(/(--bchc-ease-[\w-]+):\s*([^;]+);/g)];
		expect(eases.length).toBeGreaterThan(0);
		for (const [, name, value] of eases) {
			expect(value, name).not.toContain("linear(");
		}
	});

	it("are overridden back to the exact linear() curves where supported", async () => {
		const css = await readFile(TOKENS, "utf8");
		const supportsIndex = css.indexOf(
			"@supports (transition-timing-function: linear(0, 1))",
		);
		expect(supportsIndex).toBeGreaterThan(-1);
		const block = bodyOf(css, supportsIndex);
		for (const name of [
			"--bchc-ease-enter",
			"--bchc-ease-spring",
			"--bchc-ease-settle",
		]) {
			expect(block, name).toContain(`${name}: linear(`);
		}
	});
});
