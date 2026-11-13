// An accent without an explicit neutral takes its paired neutral family; an
// explicit `data-bchc-neutral` still wins.

import { html } from "lit";
import { expect } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { BCHC_ACCENT_DEFAULT_NEUTRAL, BCHC_ACCENTS } from "../src/index.ts";

function neutralScale(attributes: Record<string, string>): string {
	const element = document.createElement("bchc-modal");
	for (const [name, value] of Object.entries(attributes)) {
		element.setAttribute(name, value);
	}
	document.body.append(element);
	const scale = getComputedStyle(element)
		.getPropertyValue("--bchc-neutral-1")
		.trim();
	element.remove();
	return scale;
}

// An explicit empty args type: inferring one for a meta without a component trips TS2590.
const meta = preview.type<{ args: Record<string, never> }>().meta({
	title: "Theme/Pairing",
	// Test-only: the play reads computed styles, so there is nothing to browse.
	tags: ["!dev", "!autodocs"],
	render: () => html`<p>The modals mount on document.body.</p>`,
});

export const AccentTakesItsPairedNeutral = meta.story({
	play: async () => {
		for (const accent of BCHC_ACCENTS) {
			const paired = BCHC_ACCENT_DEFAULT_NEUTRAL[accent];
			expect(
				neutralScale({ "data-bchc-accent": accent }),
				`${accent} pairs with ${paired}`,
			).toBe(neutralScale({ "data-bchc-neutral": paired }));
		}
	},
});

export const ExplicitNeutralWins = meta.story({
	play: async () => {
		expect(
			neutralScale({
				"data-bchc-accent": "violet",
				"data-bchc-neutral": "sand",
			}),
		).toBe(neutralScale({ "data-bchc-neutral": "sand" }));
	},
});
