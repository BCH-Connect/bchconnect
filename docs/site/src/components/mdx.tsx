import * as Twoslash from "fumadocs-twoslash/ui";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { FrameworkTabs } from "./framework-tabs";

export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		...TabsComponents,
		...Twoslash,
		FrameworkTabs,
		...components,
	} satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
