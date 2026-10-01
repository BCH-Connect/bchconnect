import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import { definePreview } from "@storybook/web-components-vite";
import { defineElements } from "../src/index.ts";

defineElements();

export default definePreview({
	addons: [addonA11y(), addonDocs()],
	parameters: {
		// Both elements are viewport overlays, not inline content.
		layout: "fullscreen",
	},
});
