import { html, nothing } from "lit";
import { action } from "storybook/actions";
import preview, { resolveMode } from "../.storybook/preview.ts";
import type { ToastView } from "../src/toast.ts";
import { CONNECTED_WALLET } from "./fixtures.ts";
import { THEME_ARG_TYPES, type ThemeArgs } from "./theme.ts";

// The toast has no backdrop, so no blur.
interface ToastStoryArgs extends Omit<ThemeArgs, "backdropBlur"> {
	readonly view: ToastView;
	readonly duration: number;
}

const { backdropBlur: _, ...TOAST_ARG_TYPES } = THEME_ARG_TYPES;

const meta = preview.type<{ args: ToastStoryArgs }>().meta({
	component: "bchc-toast",
	argTypes: TOAST_ARG_TYPES,
	args: {
		// Stays on screen so it can be inspected; `AutoDismiss` shows the default.
		duration: Number.POSITIVE_INFINITY,
		view: {
			walletName: CONNECTED_WALLET.name,
			walletLogo: CONNECTED_WALLET.logo,
		},
	},
	render: (args, context) => html`
		<bchc-toast
			data-bchc-accent=${args.accent ?? nothing}
			data-bchc-neutral=${args.neutral ?? nothing}
			data-bchc-radius=${args.radius ?? nothing}
			data-bchc-font=${args.font ?? nothing}
			data-bchc-mode=${resolveMode(context.globals)}
			.view=${args.view}
			.duration=${args.duration}
			@bchc-dismiss=${action("bchc-dismiss")}
		></bchc-toast>
	`,
});

export const Connected = meta.story({});

export const NoLogo = meta.story({
	args: { view: { walletName: CONNECTED_WALLET.name, walletLogo: null } },
});

export const Unidentified = meta.story({
	args: { view: { walletName: null, walletLogo: null } },
});

export const AutoDismiss = meta.story({
	args: { duration: 3600 },
});
