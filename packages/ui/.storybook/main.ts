import { defineMain } from "@storybook/web-components-vite/node";
import { cssSheets } from "../tools/css-sheets.ts";

export default defineMain({
	stories: ["../stories/**/*.stories.ts"],
	addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
	framework: "@storybook/web-components-vite",
	core: {
		disableTelemetry: true,
	},
	async viteFinal(config) {
		// "pre": resolve the package's stylesheets before Vite's own CSS handling claims them.
		config.plugins = [
			{ ...cssSheets(), enforce: "pre" },
			...(config.plugins ?? []),
		];
		return config;
	},
});
