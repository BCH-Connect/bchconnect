import { readFileSync } from "node:fs";
import { defineConfig, mergeConfig } from "tsdown/config";
import { baseConfig } from "../../tsdown.config.base.ts";
import { BROWSER_TARGETS, cssSheets } from "./tools/css-sheets.ts";

// oxc's dts generator drops a comment not attached to a surviving
// declaration, so the banner below re-inserts this verbatim as dist/index.d.ts's first bytes.
function packageDocComment(): string {
	const source = readFileSync(
		new URL("./src/index.ts", import.meta.url),
		"utf8",
	);
	const match = /^\/\*\*[\s\S]*?\*\//.exec(source);
	if (match === null) {
		throw new Error(
			"src/index.ts must start with the @packageDocumentation comment.",
		);
	}
	return match[0];
}

// ESM only: custom elements need a browser, so there's no CommonJS consumer.
export default defineConfig(
	mergeConfig(baseConfig, {
		entry: ["src/index.ts"],
		format: ["esm"],
		platform: "browser",
		target: [...BROWSER_TARGETS],
		plugins: [cssSheets()],
		// One file per module: with sideEffects:false, skipping defineElements skips qr-code-styling.
		unbundle: true,
		banner: (ctx) =>
			ctx.fileName === "index.d.ts" ? { dts: packageDocComment() } : undefined,
	}),
);
