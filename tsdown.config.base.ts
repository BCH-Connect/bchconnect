import type { UserConfig } from "tsdown";

/**
 * Shared tsdown options for every package: ESM + CJS output, declarations
 * generated from isolated declarations, and source maps with sources inlined.
 *
 * @example
 * ```ts
 * import { defineConfig, mergeConfig } from "tsdown/config";
 * import { baseConfig } from "../../tsdown.config.base.ts";
 *
 * export default defineConfig(
 * 	mergeConfig(baseConfig, { entry: ["src/index.ts"], unbundle: true }),
 * );
 * ```
 *
 * @internal
 */
export const baseConfig: UserConfig = {
	format: ["esm", "cjs"],
	dts: { generator: "oxc", sourcemap: false },
	sourcemap: true,
};
