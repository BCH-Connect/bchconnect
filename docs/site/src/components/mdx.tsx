import * as Twoslash from "fumadocs-twoslash/ui";
import { Callout as FumadocsCallout } from "fumadocs-ui/components/callout";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { FrameworkTabs } from "./framework-tabs";

function Callout({
	type = "info",
	className,
	...props
}: ComponentProps<typeof FumadocsCallout>) {
	return (
		<FumadocsCallout
			type={type}
			className={cn("callout", type === "info" && "callout-info", className)}
			{...props}
		/>
	);
}

export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		...TabsComponents,
		...Twoslash,
		FrameworkTabs,
		Callout,
		...components,
	} satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
