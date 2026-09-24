import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["packages/*/test/**/*.test.ts"],
		typecheck: {
			enabled: true,
			build: true,
			include: ["packages/*/test/**/*.test-d.ts"],
		},
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
	},
});
