import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// `pnpm webkit-server` starts this
const webkitWsEndpoint = process.env.PW_WEBKIT_WS_ENDPOINT;

export default defineConfig({
	resolve: {
		alias: {
			"@bchconnect/core": fileURLToPath(
				new URL("./packages/core/src/index.ts", import.meta.url),
			),
			"@bchconnect/test-utils": fileURLToPath(
				new URL("./packages/test-utils/src/index.ts", import.meta.url),
			),
		},
	},
	test: {
		coverage: {
			provider: "v8",
			include: ["packages/*/src/**"],
			exclude: ["packages/test-utils/src/**"],
			thresholds: {
				"packages/core/src/**": {
					statements: 95,
					branches: 95,
					functions: 95,
					lines: 95,
				},
				"packages/connector-*/src/**": {
					statements: 85,
					branches: 85,
					functions: 85,
					lines: 85,
				},
			},
		},
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["packages/*/test/**/*.test.ts"],
					typecheck: {
						enabled: true,
						build: true,
						include: ["packages/*/test/**/*.test-d.ts"],
					},
				},
			},
			{
				extends: true,
				plugins: [
					storybookTest({
						configDir: "packages/ui/.storybook",
						// The reduced-motion story only runs under its own project below.
						tags: { include: ["test"], exclude: ["motion-reduced"], skip: [] },
					}),
				],
				test: {
					name: "storybook",
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [
							{ browser: "chromium" },
							{ browser: "firefox" },
							{
								browser: "webkit",
								// Native launch (CI) unless a local WebKit server is given.
								provider: webkitWsEndpoint
									? playwright({
											connectOptions: { wsEndpoint: webkitWsEndpoint },
										})
									: playwright(),
							},
						],
					},
				},
			},
			{
				extends: true,
				plugins: [
					storybookTest({
						configDir: "packages/ui/.storybook",
						tags: { include: ["motion-reduced"], exclude: [], skip: [] },
					}),
				],
				test: {
					name: "storybook-reduced-motion",
					browser: {
						enabled: true,
						headless: true,
						// Context-level emulation: the component reads `prefers-reduced-motion`
						// through CSS custom properties, which a page-level `matchMedia` patch
						// can't affect.
						provider: playwright({
							contextOptions: { reducedMotion: "reduce" },
						}),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});
