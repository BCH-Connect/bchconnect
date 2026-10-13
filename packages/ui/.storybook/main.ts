import { defineMain } from "@storybook/web-components-vite/node";
import { cssSheets } from "../tools/css-sheets.ts";

export default defineMain({
	// A static build can't serve the source modules the Trusted Types stories
	// import, so they're built only for the dev server and the Vitest runs.
	stories: (_entries, options) =>
		options.configType === "PRODUCTION"
			? ["../stories/**/!(trusted-types).stories.ts"]
			: ["../stories/**/*.stories.ts"],
	addons: [
		"@storybook/addon-a11y",
		"@storybook/addon-docs",
		"@storybook/addon-vitest",
	],
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
