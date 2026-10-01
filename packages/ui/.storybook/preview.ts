import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import * as webComponentsArgTypes from "@storybook/web-components/entry-preview-argtypes";
import {
	definePreview,
	setCustomElementsManifest,
} from "@storybook/web-components-vite";
import customElementsManifest from "../custom-elements.json" with {
	type: "json",
};
import { defineElements } from "../src/index.ts";

defineElements();
setCustomElementsManifest(customElementsManifest);

export default definePreview({
	// The web-components definePreview omits its manifest-to-ArgTypes annotations
	// (10.6.1); remove this entry once it bundles them like the React one does.
	addons: [addonA11y(), addonDocs(), webComponentsArgTypes],
	tags: ["autodocs"],
	parameters: {
		// Both elements are viewport overlays, not inline content.
		layout: "fullscreen",
	},
});
