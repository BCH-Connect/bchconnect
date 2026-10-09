import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import * as webComponentsArgTypes from "@storybook/web-components/entry-preview-argtypes";
import type { Decorator } from "@storybook/web-components-vite";
import {
	definePreview,
	setCustomElementsManifest,
} from "@storybook/web-components-vite";
import "@fontsource-variable/plus-jakarta-sans";
import { html } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import customElementsManifest from "../custom-elements.json" with {
	type: "json",
};
import { defineElements } from "../src/index.ts";
import type { BchcMode } from "../src/theme.generated.ts";

defineElements();
setCustomElementsManifest(customElementsManifest);

/** Narrows a story's `mode` global to `BchcMode`, defaulting to `auto`. */
export function resolveMode(globals: { readonly mode?: unknown }): BchcMode {
	return globals.mode === "light" || globals.mode === "dark"
		? globals.mode
		: "auto";
}

/** Narrows a story's `direction` global, defaulting to `ltr`. */
export function resolveDirection(globals: {
	readonly direction?: unknown;
}): "ltr" | "rtl" {
	return globals.direction === "rtl" ? "rtl" : "ltr";
}

const COLOR_SCHEME: Readonly<Record<BchcMode, string>> = {
	auto: "light dark",
	light: "light",
	dark: "dark",
};

/** A page behind every story that follows the `mode`/`direction` globals and supplies the brand face. */
const withCanvas: Decorator = (story, context) => html`
	<div
		dir=${resolveDirection(context.globals)}
		style=${styleMap({
			minHeight: "100vh",
			colorScheme: COLOR_SCHEME[resolveMode(context.globals)],
			background: "light-dark(#f4f4f3, #141414)",
			"--bchc-font-brand-family": '"Plus Jakarta Sans Variable"',
		})}
	>
		${story()}
	</div>
`;

export default definePreview({
	// The web-components definePreview omits its manifest-to-ArgTypes annotations
	// (10.6.1); remove this entry once it bundles them like the React one does.
	addons: [addonA11y(), addonDocs(), webComponentsArgTypes],
	tags: ["autodocs"],
	decorators: [withCanvas],
	globalTypes: {
		mode: {
			description: "Color scheme BCH Connect elements render in",
			toolbar: {
				title: "Mode",
				icon: "circlehollow",
				items: ["auto", "light", "dark"],
				dynamicTitle: true,
			},
		},
		direction: {
			description: "Text direction BCH Connect elements render in",
			toolbar: {
				title: "Direction",
				icon: "direction",
				items: [
					{ value: "ltr", title: "LTR" },
					{ value: "rtl", title: "RTL" },
				],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: {
		mode: "auto",
		direction: "ltr",
	},
	parameters: {
		// Both elements are viewport overlays, not inline content.
		layout: "fullscreen",
		// Any axe violation fails the story's test instead of just warning.
		a11y: { test: "error" },
		// Stories pick these with `globals.viewport`; addon-vitest sizes the test page from them too.
		viewport: {
			options: {
				desktop: {
					name: "Desktop",
					styles: { width: "1200px", height: "900px" },
					type: "desktop",
				},
				desktopShort: {
					name: "Desktop (short)",
					styles: { width: "1200px", height: "600px" },
					type: "desktop",
				},
				phone: {
					name: "Phone",
					styles: { width: "390px", height: "844px" },
					type: "mobile",
				},
				phoneSmall: {
					name: "Phone (small)",
					styles: { width: "375px", height: "667px" },
					type: "mobile",
				},
				phoneSmallest: {
					name: "Phone (smallest)",
					styles: { width: "360px", height: "640px" },
					type: "mobile",
				},
			},
		},
	},
});
