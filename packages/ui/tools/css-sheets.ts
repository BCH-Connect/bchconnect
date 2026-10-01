// Build plugin for tsdown and Storybook's Vite: replaces `with { type: "css" }`
// imports (unsupported by Safari/most bundlers) with a module building the same
// CSSStyleSheet from inlined, minified text. Default export is `null` on a server.

import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { type Targets, transform } from "lightningcss";
import type { TsdownPlugin } from "tsdown";

/** `major << 16 | minor << 8`, the encoding lightningcss expects. */
const version = (major: number, minor = 0): number =>
	(major << 16) | (minor << 8);

// First releases with adoptedStyleSheets, color-mix() and oklch() in all three engines.
export const BROWSER_TARGETS: readonly string[] = [
	"chrome111",
	"firefox113",
	"safari16.4",
];

const CSS_TARGETS: Targets = {
	chrome: version(111),
	firefox: version(113),
	safari: version(16, 4),
};

// Real path + suffix, not a `\0` virtual id: tsdown refuses a bare `.css` id
// without its own CSS pipeline, and a real path keeps output names relative to `src`.
// No `?` query: Vite treats any `.css?…` id as CSS and would minify this module as CSS.
const SUFFIX = ".sheet.js";

// Only the package's own imports: Storybook's preview also imports ordinary CSS.
const SOURCE_DIR = resolve(import.meta.dirname, "..", "src") + sep;

/** The module that stands in for a stylesheet import: the same CSSStyleSheet, built from inlined, minified text. */
export async function sheetModule(
	file: string,
	warn: (message: string) => void,
): Promise<string> {
	const { code, warnings } = transform({
		filename: file,
		code: await readFile(file),
		minify: true,
		targets: CSS_TARGETS,
	});
	for (const warning of warnings) {
		warn(`${file}: ${warning.message}`);
	}
	const text = JSON.stringify(code.toString());
	return [
		`const text = ${text};`,
		// @__PURE__: a consumer's bundler can drop this when nothing adopts it.
		"export default /* @__PURE__ */ (() => {",
		'\tif (typeof CSSStyleSheet !== "function") return null;',
		"\tconst sheet = new CSSStyleSheet();",
		"\tsheet.replaceSync(text);",
		"\treturn sheet;",
		"})();",
	].join("\n");
}

export function cssSheets(): TsdownPlugin {
	return {
		name: "bchc:css-sheets",
		resolveId: {
			filter: { id: /\.css$/ },
			handler(source, importer) {
				if (importer === undefined || !importer.startsWith(SOURCE_DIR)) {
					return null;
				}
				return resolve(importer, "..", source) + SUFFIX;
			},
		},
		load: {
			filter: { id: /\.css\.sheet\.js$/ },
			async handler(id) {
				const file = id.slice(0, -SUFFIX.length);
				return {
					moduleType: "js",
					code: await sheetModule(file, (message) => this.warn(message)),
				};
			},
		},
	};
}
