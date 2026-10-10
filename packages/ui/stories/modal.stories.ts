import { waitForAnimations } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { CONNECTED_WALLET, viewFor } from "./fixtures.ts";
import {
	detailOf,
	type ModalStoryArgs,
	modalHost,
	modalRender,
	modalShadow,
} from "./modal.ts";
import { THEME_ARG_TYPES } from "./theme.ts";

const meta = preview.type<{ args: ModalStoryArgs }>().meta({
	component: "bchc-modal",
	argTypes: THEME_ARG_TYPES,
	args: { view: viewFor() },
	render: modalRender,
	// Fallback for stories with no play of their own: axe (which runs after
	// play) must only see the settled entrance, never a mid-fade frame.
	play: async () => {
		await waitForAnimations();
	},
});

// WizardConnect on mainnet unless a story says otherwise.
export const Scan = meta.story({
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		// The entrance focuses the dialog itself, once it has entered.
		await waitFor(() =>
			expect(shadow.activeElement).toBe(
				shadow.querySelector('[role="dialog"]'),
			),
		);
		await waitForAnimations();
	},
});

export const GettingLink = meta.story({
	args: { view: viewFor({ phase: { kind: "initiating" } }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitForAnimations();
	},
});

export const Declined = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "rejected" } }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const onRetry = fn<(event: Event) => void>();
		modal.addEventListener("bchc-retry", onRetry);
		const retry = shadow.querySelector<HTMLButtonElement>('[data-act="retry"]');
		if (retry === null) throw new Error("retry button missing");
		await userEvent.click(retry);
		expect(onRetry).toHaveBeenCalledTimes(1);
		await waitForAnimations();
	},
});

export const TimedOut = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "timeout" } }) },
});

export const Stopped = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "aborted" } }) },
});

export const Offline = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "transport" } }) },
});

export const WrongNetwork = meta.story({
	args: {
		view: viewFor({ phase: { kind: "failed", reason: "network-mismatch" } }),
	},
});

export const Unsupported = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "unsupported" } }) },
});

export const Wallets = meta.story({
	args: { view: viewFor({ screen: "wallets" }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const onScreen = fn<(event: Event) => void>();
		modal.addEventListener("bchc-screen", onScreen);
		const back = shadow.querySelector<HTMLButtonElement>('[aria-label="Back"]');
		if (back === null) throw new Error("back button missing");
		await userEvent.click(back);
		await waitFor(() => expect(onScreen).toHaveBeenCalledTimes(1));
		expect(detailOf<{ screen: string }>(onScreen)).toEqual({
			screen: "connect",
		});
		await waitForAnimations();
	},
});

export const WalletConnect = meta.story({
	args: { view: viewFor({ protocol: "walletconnect" }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const onProtocol = fn<(event: Event) => void>();
		modal.addEventListener("bchc-protocol", onProtocol);

		const trigger = shadow.querySelector<HTMLButtonElement>(
			'[aria-haspopup="listbox"]',
		);
		if (trigger === null) throw new Error("session type trigger missing");
		await userEvent.click(trigger);

		const option = shadow.querySelector<HTMLElement>(
			'[role="option"][data-protocol="cashconnect"]',
		);
		if (option === null) throw new Error("cashconnect option missing");
		await userEvent.click(option);

		await waitFor(() => expect(onProtocol).toHaveBeenCalledTimes(1));
		expect(detailOf<{ protocol: string }>(onProtocol)).toEqual({
			protocol: "cashconnect",
		});
		await waitForAnimations();
	},
});

export const CashConnect = meta.story({
	args: { view: viewFor({ protocol: "cashconnect" }) },
});

export const Chipnet = meta.story({
	args: { view: viewFor({ network: "chipnet" }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const onScreen = fn<(event: Event) => void>();
		modal.addEventListener("bchc-screen", onScreen);
		const getOne = shadow.querySelector<HTMLButtonElement>(
			'[data-act="wallets"]',
		);
		if (getOne === null)
			throw new Error('"Don\'t have a wallet?" button missing');
		await userEvent.click(getOne);
		await waitFor(() => expect(onScreen).toHaveBeenCalledTimes(1));
		expect(detailOf<{ screen: string }>(onScreen)).toEqual({
			screen: "wallets",
		});
		await waitForAnimations();
	},
});

export const Regtest = meta.story({
	args: { view: viewFor({ network: "regtest" }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);
		const close = shadow.querySelector<HTMLButtonElement>(
			'[aria-label="Close"]',
		);
		if (close === null) throw new Error("close button missing");
		await userEvent.click(close);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitForAnimations();
	},
});

export const ClosesOnConnect = meta.story({
	play: async ({ canvasElement, args }) => {
		const modal = modalHost(canvasElement);
		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);
		modal.view = {
			...args.view,
			phase: {
				kind: "connected",
				walletName: CONNECTED_WALLET.name,
				walletLogo: CONNECTED_WALLET.logo,
			},
		};
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitForAnimations();
	},
});

// Tagged so the dedicated reduced-motion Vitest project (see vitest.config.ts)
// is the only one that runs it; the other browsers already cover this story's
// markup under ordinary motion via `Scan`.
export const ReducedMotion = meta.story({
	tags: ["motion-reduced"],
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		await waitFor(() =>
			expect(shadow.querySelector('[role="dialog"]')).toBeVisible(),
		);

		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);
		const close = shadow.querySelector<HTMLButtonElement>(
			'[aria-label="Close"]',
		);
		if (close === null) throw new Error("close button missing");
		await userEvent.click(close);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitForAnimations();
	},
});
