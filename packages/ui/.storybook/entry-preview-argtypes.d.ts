// The package ships this preview entry without declarations.
declare module "@storybook/web-components/entry-preview-argtypes" {
	import type { WebComponentsRenderer } from "@storybook/web-components";
	import type { ArgTypesEnhancer, Parameters } from "storybook/internal/types";

	export const parameters: Parameters;
	export const argTypesEnhancers: ArgTypesEnhancer<WebComponentsRenderer>[];
}
