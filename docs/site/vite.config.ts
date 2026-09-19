import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { transformerTwoslash } from "fumadocs-twoslash";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: 3000,
	},
	plugins: [
		fumadocsMdx({
			globalOptions: {
				mdxOptions: {
					rehypeCodeOptions: {
						themes: { light: "github-light", dark: "github-dark" },
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
		// please see https://tanstack.com/start/latest/docs/framework/react/guide/hosting#nitro for guides on hosting
		nitro({
			preset: "vercel",
		}),
	],
	resolve: {
		tsconfigPaths: true,
		alias: {
			tslib: "tslib/tslib.es6.js",
		},
	},
});
