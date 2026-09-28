// tsdown plugin: replaces `with { type: "css" }` imports (unsupported by
// Safari/most bundlers) with a module building the same CSSStyleSheet from
// inlined, minified text. Default export is `null` on a server.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
const SUFFIX = "?sheet";

export function cssSheets(): TsdownPlugin {
	return {
		name: "bchc:css-sheets",
		resolveId: {
			filter: { id: /\.css$/ },
			handler(source, importer) {
				if (importer === undefined) return null;
				return resolve(importer, "..", source) + SUFFIX;
			},
		},
		load: {
			filter: { id: /\.css\?sheet$/ },
			async handler(id) {
				const file = id.slice(0, -SUFFIX.length);
				const { code, warnings } = transform({
					filename: file,
					code: await readFile(file),
					minify: true,
					targets: CSS_TARGETS,
				});
				for (const warning of warnings) {
					this.warn(`${file}: ${warning.message}`);
				}
				const text = JSON.stringify(code.toString());
				return {
					moduleType: "js",
					code: [
						`const text = ${text};`,
						// @__PURE__: a consumer's bundler can drop this when nothing adopts it.
						"export default /* @__PURE__ */ (() => {",
						'\tif (typeof CSSStyleSheet !== "function") return null;',
						"\tconst sheet = new CSSStyleSheet();",
						"\tsheet.replaceSync(text);",
						"\treturn sheet;",
						"})();",
					].join("\n"),
				};
			},
		},
	};
}
