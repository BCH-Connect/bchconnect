// Extreme theme combinations: axe must stay clean and nothing may spill out
// of the card at any corner of the theme surface, not just the defaults.

import { waitForAnimations } from "storybook/preview-api";
import { expect } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { viewFor } from "./fixtures.ts";
import { type ModalStoryArgs, modalRender, modalShadow } from "./modal.ts";
import { THEME_ARG_TYPES } from "./theme.ts";

const meta = preview.type<{ args: ModalStoryArgs }>().meta({
	component: "bchc-modal",
	argTypes: THEME_ARG_TYPES,
	args: { view: viewFor() },
	render: modalRender,
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const card = shadow.querySelector(".card");
		if (card instanceof HTMLElement) {
			expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
		}
		await waitForAnimations();
	},
});

export const RadiusNone = meta.story({ args: { radius: "none" } });
export const RadiusFull = meta.story({ args: { radius: "full" } });
export const FontMono = meta.story({ args: { font: "mono" } });
export const BlurLarge = meta.story({ args: { backdropBlur: "large" } });
export const AccentInk = meta.story({ args: { accent: "ink" } });
export const NeutralSage = meta.story({ args: { neutral: "sage" } });
export const NeutralSlate = meta.story({ args: { neutral: "slate" } });
export const NeutralSand = meta.story({ args: { neutral: "sand" } });
export const NeutralPure = meta.story({ args: { neutral: "pure" } });

export const AllExtremesCombined = meta.story({
	args: {
		accent: "ink",
		neutral: "pure",
		radius: "full",
		font: "mono",
		backdropBlur: "large",
	},
});
