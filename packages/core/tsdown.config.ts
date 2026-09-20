import { defineConfig, mergeConfig } from "tsdown/config";
import { baseConfig } from "../../tsdown.config.base.ts";

export default defineConfig(
	mergeConfig(baseConfig, {
		entry: ["src/index.ts"],
		platform: "neutral",
	}),
);
