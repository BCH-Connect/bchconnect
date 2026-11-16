import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { transformerTwoslash } from "fumadocs-twoslash";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: 3000,
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		fumadocsMdx({
			globalOptions: {
				mdxOptions: {
					rehypeCodeOptions: {
						themes: { light: "dracula", dark: "dracula" },
						transformers: [
							...(rehypeCodeDefaultOptions.transformers ?? []),
							transformerTwoslash(),
						],
						// Twoslash popups can't lazy-load languages, so declare them up front.
						langs: ["js", "jsx", "ts", "tsx"],
					},
				},
			},
		}),
		tailwindcss(),
		tanstackStart({
			prerender: {
				enabled: true,
			},
		}),
		react(),
	],
	resolve: {
		tsconfigPaths: true,
		alias: {
			tslib: "tslib/tslib.es6.js",
		},
	},
});
