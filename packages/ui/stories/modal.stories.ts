import { waitForAnimations } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { BCHC_DIRECTORY } from "../src/defaults.ts";
import { BCHC_MESSAGES_ES } from "../src/locales/es.ts";
import { BCHC_MESSAGES_EN } from "../src/messages.ts";
import { CONNECTED_WALLET, viewFor } from "./fixtures.ts";
import {
	detailOf,
	expectFailureCopy,
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
		expectFailureCopy(canvasElement, "rejected");
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
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		expectFailureCopy(canvasElement, "timeout");
	},
});

export const Stopped = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "aborted" } }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		expectFailureCopy(canvasElement, "aborted");
	},
});

export const Offline = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "transport" } }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		expectFailureCopy(canvasElement, "transport");
	},
});

export const WrongNetwork = meta.story({
	args: {
		view: viewFor({ phase: { kind: "failed", reason: "network-mismatch" } }),
	},
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		expectFailureCopy(canvasElement, "network-mismatch");
	},
});

export const Unsupported = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "unsupported" } }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		expectFailureCopy(canvasElement, "unsupported");
	},
});

// Spanish copy on the same failure face, next to `Unsupported` so a height
// regression between locales is a visible diff in the same file.
export const UnsupportedEs = meta.story({
	args: {
		view: viewFor({ phase: { kind: "failed", reason: "unsupported" } }),
		messages: BCHC_MESSAGES_ES,
	},
	globals: { viewport: { value: "desktop" } },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		expectFailureCopy(canvasElement, "unsupported", BCHC_MESSAGES_ES);
		const shadow = modalShadow(canvasElement);
		const overlay = shadow.querySelector(".overlay");
		expect(overlay?.getAttribute("lang")).toBe("es");

		// SPEC §8.3: a failure changes the tile, not the modal's height.
		const card = shadow.querySelector(".card");
		const tile = shadow.querySelector(".tile");
		const title = shadow.querySelector(".status-title");
		const detail = shadow.querySelector(".status-detail");
		if (
			!(card instanceof HTMLElement) ||
			!(tile instanceof HTMLElement) ||
			!(title instanceof HTMLElement) ||
			!(detail instanceof HTMLElement)
		)
			throw new Error("card, tile, status title or status detail missing");

		const tileBox = tile.getBoundingClientRect();
		const titleBox = title.getBoundingClientRect();
		const detailBox = detail.getBoundingClientRect();
		expect(titleBox.top).toBeGreaterThanOrEqual(tileBox.top - 1);
		expect(titleBox.bottom).toBeLessThanOrEqual(tileBox.bottom + 1);
		expect(detailBox.top).toBeGreaterThanOrEqual(tileBox.top - 1);
		expect(detailBox.bottom).toBeLessThanOrEqual(tileBox.bottom + 1);

		const esHeight = card.getBoundingClientRect().height;
		const modal = modalHost(canvasElement);
		modal.messages = null;
		await waitFor(() =>
			expect(shadow.querySelector(".overlay")?.getAttribute("lang")).toBe("en"),
		);
		await waitForAnimations();
		expect(card.getBoundingClientRect().height).toBeCloseTo(esHeight, 0);
	},
});

// Spanish copy on the wallets screen: the heading translates and the card
// never grows wider than its own content, in a script with longer words.
export const WalletsEs = meta.story({
	args: {
		view: viewFor({ screen: "wallets" }),
		messages: BCHC_MESSAGES_ES,
	},
	globals: { viewport: { value: "desktop" } },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const shadow = modalShadow(canvasElement);
		const heading = shadow.querySelector(".section-label");
		expect(heading?.textContent).toBe(BCHC_MESSAGES_ES.directoryHeading);
		const card = shadow.querySelector(".card");
		const body = shadow.querySelector(".body");
		if (!(card instanceof HTMLElement) || !(body instanceof HTMLElement))
			throw new Error("card or body missing");
		expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
		expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
		await waitForAnimations();
	},
});

export const Wallets = meta.story({
	args: { view: viewFor({ screen: "wallets" }) },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);

		// None of BCHC_DIRECTORY's entries carry a `label`, so every link falls
		// back to `getWallet(name)`.
		const rows = shadow.querySelectorAll<HTMLElement>(".directory-row");
		expect(rows).toHaveLength(BCHC_DIRECTORY.length);
		rows.forEach((row, index) => {
			const entry = BCHC_DIRECTORY[index];
			if (entry === undefined) throw new Error("directory entry missing");
			const button = row.querySelector(".directory-links .button");
			if (button === null) throw new Error("directory link button missing");
			expect(button.textContent).toContain(
				BCHC_MESSAGES_EN.getWallet(entry.name),
			);
		});

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

// Fixture copy, not a real translation: proves a partial override renders
// and an un-overridden string stays English.
export const MessagesOverride = meta.story({
	args: {
		view: viewFor({ phase: { kind: "failed", reason: "rejected" } }),
		messages: { connectTitle: "Fixture title", tryAgain: "Fixture retry" },
	},
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const shadow = modalShadow(canvasElement);
		const title = shadow.querySelector(".title");
		expect(title?.textContent).toBe("Fixture title");
		const retry = shadow.querySelector('[data-act="retry"]');
		expect(retry?.textContent).toContain("Fixture retry");
		const close = shadow.querySelector('[aria-label="Close"]');
		expect(close).not.toBeNull();
		const overlay = shadow.querySelector(".overlay");
		expect(overlay?.getAttribute("lang")).toBe("en");
	},
});

// Setting `messages` while the modal is already open must take effect
// without a page reload: title, the code's accessible name, and `lang`.
export const MessagesLiveChange = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		modal.messages = {
			connectTitle: "Fixture connect",
			copyLinkLabel: "Fixture copy label",
			lang: "qaa",
		};
		await waitFor(() =>
			expect(shadow.querySelector(".title")?.textContent).toBe(
				"Fixture connect",
			),
		);
		const code = shadow.querySelector(".code");
		expect(code?.getAttribute("aria-label")).toBe("Fixture copy label");
		expect(shadow.querySelector(".overlay")?.getAttribute("lang")).toBe("qaa");
	},
});

export const MessagesSetWhileClosed = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const view = modal.view;
		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		modal.messages = { copyLinkLabel: "Fixture copy label" };
		modal.view = view;
		await waitFor(() =>
			expect(shadow.querySelector(".code")?.getAttribute("aria-label")).toBe(
				"Fixture copy label",
			),
		);
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
