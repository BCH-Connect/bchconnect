/**
 * Tests for the build plugin that turns stylesheet imports into shared,
 * constructed sheets.
 *
 * The plugin only runs inside a build, so nothing else notices when it stops
 * minifying, starts emitting a module that touches the DOM on import, or lets
 * an id through that tsdown's own CSS guard rejects. These drive its hooks by
 * hand against the real stylesheets.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cssSheets } from "../tools/css-sheets.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const IMPORTER = join(HERE, "..", "src", "modal.ts");
const STYLESHEET = join(HERE, "..", "src", "styles", "modal.css");

/** The two hooks the plugin defines, narrowed to how they are called here. */
interface SheetHooks {
	resolveId: {
		filter: { id: RegExp };
		handler(source: string, importer: string | undefined): string | null;
	};
	load: {
		filter: { id: RegExp };
		handler(id: string): Promise<{ code: string; moduleType: string }>;
	};
}

const hooks = cssSheets() as unknown as SheetHooks;

async function emit(source: string): Promise<string> {
	const id = hooks.resolveId.handler(source, IMPORTER);
	if (id === null) throw new Error(`${source} did not resolve`);
	return (await hooks.load.handler(id)).code;
}

/** The inlined stylesheet text, read back out of the emitted module. */
function textOf(code: string): string {
	const match = /^const text = (".*");$/m.exec(code);
	if (match?.[1] === undefined) throw new Error("no inlined text");
	return JSON.parse(match[1]) as string;
}

describe("cssSheets", () => {
	it("should resolve a stylesheet to an id that does not end in .css", () => {
		const id = hooks.resolveId.handler("./styles/modal.css", IMPORTER);
		expect(id).not.toBeNull();
		expect(id).not.toMatch(/\.css$/);
		expect(id).toMatch(hooks.load.filter.id);
	});

	it("should leave imports without an importer alone", () => {
		expect(hooks.resolveId.handler("./styles/modal.css", undefined)).toBe(null);
	});

	it("should resolve an importer written with backslashes, as on Windows", () => {
		const id = hooks.resolveId.handler(
			"./styles/modal.css",
			IMPORTER.replaceAll("/", "\\"),
		);
		expect(id).not.toBeNull();
	});

	it("should leave stylesheets imported from outside the package source alone", () => {
		const importer = join(HERE, "..", ".storybook", "preview.ts");
		expect(hooks.resolveId.handler("./theme.css", importer)).toBe(null);
	});

	it("should inline the stylesheet minified", async () => {
		const source = await readFile(STYLESHEET, "utf8");
		const text = textOf(await emit("./styles/modal.css"));
		expect(text.length).toBeGreaterThan(0);
		expect(text.length).toBeLessThan(source.length);
		expect(text).not.toContain("\n");
		expect(text).not.toContain("/*");
	});

	it("should emit a module that imports safely without a DOM", async () => {
		const code = await emit("./styles/modal.css");
		expect(globalThis.CSSStyleSheet).toBeUndefined();
		const module = (await import(
			`data:text/javascript,${encodeURIComponent(code)}`
		)) as { default: unknown };
		expect(module.default).toBeNull();
	});
});
