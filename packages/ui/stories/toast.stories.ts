import { html, nothing } from "lit";
import { action } from "storybook/actions";
import { waitForAnimations } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor } from "storybook/test";
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

function toastHost(canvasElement: HTMLElement): HTMLElement {
	const host = canvasElement.querySelector("bchc-toast");
	if (!(host instanceof HTMLElement))
		throw new Error("bchc-toast did not render");
	return host;
}

function toastShadow(canvasElement: HTMLElement): ShadowRoot {
	const shadow = toastHost(canvasElement).shadowRoot;
	if (shadow === null) throw new Error("bchc-toast shadow root missing");
	return shadow;
}

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
	// Fallback for stories with no play of their own: axe (which runs after
	// play) must only see the settled entrance, never a mid-fade frame.
	play: async () => {
		await waitForAnimations();
	},
});

export const Connected = meta.story({});

export const Dismiss = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const toast = toastHost(canvasElement);
		const shadow = toastShadow(canvasElement);
		const onDismiss = fn<(event: Event) => void>();
		toast.addEventListener("bchc-dismiss", onDismiss);
		const dismiss = shadow.querySelector<HTMLButtonElement>(
			'[aria-label="Dismiss"]',
		);
		if (dismiss === null) throw new Error("dismiss button missing");
		await userEvent.click(dismiss);
		await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitForAnimations();
	},
});

// The avatar (DOM-first) and the title trail it in reading order; under
// `direction: rtl` that places the avatar at the toast's right edge.
export const ConnectedRtl = meta.story({
	globals: { direction: "rtl" },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const shadow = toastShadow(canvasElement);
		const mark = shadow.querySelector(".done-mark");
		const title = shadow.querySelector(".done-title");
		if (!(mark instanceof HTMLElement) || !(title instanceof HTMLElement))
			throw new Error("done-mark or done-title missing");
		expect(mark.getBoundingClientRect().left).toBeGreaterThan(
			title.getBoundingClientRect().left,
		);
		await waitForAnimations();
	},
});

export const NoLogo = meta.story({
	args: { view: { walletName: CONNECTED_WALLET.name, walletLogo: null } },
});

export const Unidentified = meta.story({
	args: { view: { walletName: null, walletLogo: null } },
});

export const AutoDismiss = meta.story({
	args: { duration: 3600 },
	play: async ({ canvasElement }) => {
		const toast = toastHost(canvasElement);
		const onDismiss = fn<(event: Event) => void>();
		toast.addEventListener("bchc-dismiss", onDismiss);
		await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1), {
			timeout: 6000,
		});
		await waitForAnimations();
	},
});

/** Frameworks often attach the element before assigning `view`; the countdown must still run. */
export const ViewAfterAttach = meta.story({
	render: () => html`<div></div>`,
	play: async ({ canvasElement }) => {
		const toast = document.createElement("bchc-toast");
		toast.duration = 300;
		const onDismiss = fn<(event: Event) => void>();
		toast.addEventListener("bchc-dismiss", onDismiss);
		canvasElement.append(toast);
		// The view arrives after a full duration has passed with nothing to show.
		await new Promise((resolve) => setTimeout(resolve, 400));
		toast.view = {
			walletName: CONNECTED_WALLET.name,
			walletLogo: CONNECTED_WALLET.logo,
		};
		try {
			await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1), {
				timeout: 3000,
			});
		} finally {
			toast.remove();
		}
	},
});
