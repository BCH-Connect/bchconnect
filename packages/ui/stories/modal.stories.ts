import { html } from "lit";
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
		// The entrance focuses the card, once it has entered; the dialog
		// itself is the native modal `<dialog>` (SPEC §8.7).
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		const dialog = shadow.querySelector(".overlay");
		expect(dialog).toBeInstanceOf(HTMLDialogElement);
		expect(dialog instanceof HTMLDialogElement && dialog.open).toBe(true);
		expect(dialog?.matches(":modal")).toBe(true);
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
		await waitFor(() => expect(shadow.querySelector(".card")).toBeVisible());

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

// SPEC §8.7: an opener button living outside the modal, in the light DOM,
// so the stories below can prove the page behind stays inert and that focus
// returns to it once the modal closes.
function withOpener(
	args: ModalStoryArgs,
	context: Parameters<typeof modalRender>[1],
) {
	return html`<button type="button">Opener</button>${modalRender(args, context)}`;
}

/** The light-DOM opener button rendered by `withOpener`. */
function opener(canvasElement: HTMLElement): HTMLButtonElement {
	const button = canvasElement.querySelector("button");
	if (!(button instanceof HTMLButtonElement))
		throw new Error("opener button missing");
	return button;
}

export const PageInert = meta.story({
	render: withOpener,
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const shadow = modalShadow(canvasElement);
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		const openerButton = opener(canvasElement);

		// The rest of the page is inert while the dialog is open: a scripted
		// focus doesn't land on it (a real click's hit-testing is blocked the
		// same way, but a synthetic click event bypasses hit-testing, so it
		// isn't something this harness can assert).
		openerButton.focus();
		expect(document.activeElement).not.toBe(openerButton);
		await waitForAnimations();
	},
});

export const FocusRestoredAfterEscape = meta.story({
	render: withOpener,
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const openerButton = opener(canvasElement);

		// Closed first, so reopening captures this test's own opener as the
		// element the native dialog restores focus to.
		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		openerButton.focus();
		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);
		modal.view = args.view;
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitFor(() => expect(document.activeElement).toBe(openerButton));
		await waitForAnimations();
	},
});

export const FocusRestoredAfterCloseButton = meta.story({
	render: withOpener,
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const openerButton = opener(canvasElement);

		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		openerButton.focus();
		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);
		modal.view = args.view;
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		const close = shadow.querySelector<HTMLButtonElement>(
			'[aria-label="Close"]',
		);
		if (close === null) throw new Error("close button missing");
		await userEvent.click(close);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitFor(() => expect(document.activeElement).toBe(openerButton));
		await waitForAnimations();
	},
});

export const FocusRestoredAfterViewCleared = meta.story({
	render: withOpener,
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const openerButton = opener(canvasElement);

		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		openerButton.focus();
		modal.view = args.view;
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		expect(document.activeElement).toBe(openerButton);
	},
});

// Escape with the session-type menu open closes only the menu; a second
// Escape then plays the exit and closes the modal, with exactly one
// `bchc-close` (SPEC §8.7).
export const EscapeClosesMenuThenModal = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const trigger = shadow.querySelector<HTMLButtonElement>(
			'[aria-haspopup="listbox"]',
		);
		if (trigger === null) throw new Error("session type trigger missing");
		await userEvent.click(trigger);
		await waitFor(() =>
			expect(trigger.getAttribute("aria-expanded")).toBe("true"),
		);

		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);

		await userEvent.keyboard("{Escape}");
		await waitFor(() =>
			expect(trigger.getAttribute("aria-expanded")).toBe("false"),
		);
		// The menu's own close animation must settle (`#closeMenu`) before a
		// second Escape can tell it's closed and move on to the modal.
		const menu = shadow.querySelector<HTMLElement>(".menu");
		await waitFor(() => expect(menu?.hidden).toBe(true));
		expect(onClose).not.toHaveBeenCalled();

		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitForAnimations();
		// Re-checked after the exit has fully settled: still exactly one.
		expect(onClose).toHaveBeenCalledTimes(1);
	},
});

// A synthetic `cancel`, standing in for the dialog's own close-watcher
// signal (independent of the Escape keypress that normally triggers it):
// the menu closes first, a second one plays the exit, and each is prevented
// so the native close watcher never runs ahead of our own handling.
export const CancelClosesMenuThenModal = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const dialog = shadow.querySelector(".overlay");
		if (!(dialog instanceof HTMLDialogElement))
			throw new Error("dialog missing");
		const trigger = shadow.querySelector<HTMLButtonElement>(
			'[aria-haspopup="listbox"]',
		);
		if (trigger === null) throw new Error("session type trigger missing");
		await userEvent.click(trigger);
		await waitFor(() =>
			expect(trigger.getAttribute("aria-expanded")).toBe("true"),
		);

		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);

		const firstCancel = new Event("cancel", { cancelable: true });
		dialog.dispatchEvent(firstCancel);
		expect(firstCancel.defaultPrevented).toBe(true);
		await waitFor(() =>
			expect(trigger.getAttribute("aria-expanded")).toBe("false"),
		);
		const menu = shadow.querySelector<HTMLElement>(".menu");
		await waitFor(() => expect(menu?.hidden).toBe(true));
		expect(onClose).not.toHaveBeenCalled();

		const secondCancel = new Event("cancel", { cancelable: true });
		dialog.dispatchEvent(secondCancel);
		expect(secondCancel.defaultPrevented).toBe(true);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitForAnimations();
		expect(onClose).toHaveBeenCalledTimes(1);
	},
});

// A close the browser forces (an uncancelable `cancel`, then the dialog closes without the exit):
// one `bchc-close`, the dialog hidden, and a later `close()` a no-op (SPEC §8.7).
export const BrowserForcedClose = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const dialog = shadow.querySelector(".overlay");
		if (!(dialog instanceof HTMLDialogElement))
			throw new Error("dialog missing");

		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);

		dialog.dispatchEvent(new Event("cancel", { cancelable: false }));
		expect(dialog.classList.contains("is-closing")).toBe(false);
		dialog.close();
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		await waitForAnimations();
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(getComputedStyle(dialog).display).toBe("none");
		expect(document.documentElement.style.overflow).not.toBe("hidden");

		await modal.close();
		await waitForAnimations();
		expect(onClose).toHaveBeenCalledTimes(1);
	},
});

// A close the browser forces while the exit plays still emits once, and the pending `close()` settles.
export const BrowserForcedCloseMidExit = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const dialog = shadow.querySelector(".overlay");
		if (!(dialog instanceof HTMLDialogElement))
			throw new Error("dialog missing");
		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);

		const closing = modal.close();
		await waitFor(() =>
			expect(dialog.classList.contains("is-closing")).toBe(true),
		);
		dialog.close();
		await closing;
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		await waitForAnimations();
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(getComputedStyle(dialog).display).toBe("none");
		expect(document.documentElement.style.overflow).not.toBe("hidden");
	},
});

// `close()` resolves only after `bchc-close` has fired (its TSDoc contract).
export const CloseResolvesAfterEvent = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);
		await modal.close();
		expect(onClose).toHaveBeenCalledTimes(1);
	},
});

// `view = null` can drop the shell while `#close` is still waiting on that
// exact dialog's exit animation; the later `close()` it eventually makes on
// the now-detached, still-open node must not emit for a shell that's gone
// (SPEC §8.7).
export const StaleShellDoesNotEmitAfterViewCleared = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const overlay = shadow.querySelector(".overlay");
		if (overlay === null) throw new Error("overlay missing");
		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);

		const staleClosed = new Promise((resolve) =>
			overlay.addEventListener("close", resolve, { once: true }),
		);
		const closing = modal.close();
		// Mid-exit: `#close` has started the animation and is awaiting it.
		await waitFor(() =>
			expect(overlay.classList.contains("is-closing")).toBe(true),
		);
		modal.view = null;
		await closing;
		await staleClosed;
		await waitForAnimations();

		// View stayed null, so there's no new shell to emit for either: the
		// stale shell's own (later) close must be silently dropped.
		expect(onClose).not.toHaveBeenCalled();
		expect(shadow.querySelector(".overlay")).toBeNull();
	},
});

// A tall light-DOM page, so the page itself can scroll (and, in an engine
// with a classic scrollbar, actually shows one) around the stories below.
function withTallPage(
	args: ModalStoryArgs,
	context: Parameters<typeof modalRender>[1],
) {
	return html`<div style="height: 3000px;"></div>${modalRender(args, context)}`;
}

// SPEC §8.7: the page behind doesn't scroll while the modal is open, and the
// vanishing scrollbar (where one exists) doesn't shift the page's width.
export const ScrollLockedWhileOpen = meta.story({
	render: withTallPage,
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const root = document.documentElement;

		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		expect(getComputedStyle(root).overflow).not.toBe("hidden");
		const widthBefore = root.clientWidth;

		modal.view = args.view;
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		expect(getComputedStyle(root).overflow).toBe("hidden");
		expect(root.clientWidth).toBe(widthBefore);
		await waitForAnimations();
	},
});

// A pre-set inline value on the page survives a lock/unlock round trip
// exactly, closing via Escape.
export const ScrollUnlockedAfterEscape = meta.story({
	render: withTallPage,
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const root = document.documentElement;

		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		root.style.overflow = "auto";
		root.style.scrollbarGutter = "auto";

		const onClose = fn<(event: Event) => void>();
		modal.addEventListener("bchc-close", onClose);
		modal.view = args.view;
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		expect(root.style.overflow).toBe("hidden");

		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		await waitForAnimations();
		expect(root.style.overflow).toBe("auto");
		expect(root.style.scrollbarGutter).toBe("auto");
	},
});

// `view = null` unlocks too, with no close event involved; an unset value
// is restored by clearing the inline style back out, not by writing "".
export const ScrollUnlockedWhenViewCleared = meta.story({
	render: withTallPage,
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const root = document.documentElement;

		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		// A clean, explicitly-unset baseline: the document is shared with the
		// other stories in this file, so a sibling's own leftover value
		// (restored correctly, for a *different* original value) must not be
		// mistaken for this story's starting point.
		root.style.overflow = "";

		modal.view = args.view;
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		expect(root.style.overflow).toBe("hidden");

		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		expect(root.style.overflow).toBe("");
	},
});

// Overlapping modals share one lock: the first to go leaves the page locked, the last restores it.
export const ScrollLockSharedByOverlappingModals = meta.story({
	render: withTallPage,
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const root = document.documentElement;

		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		// The document is shared with the other stories in this file.
		root.style.overflow = "";
		modal.view = args.view;
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);

		const second = document.createElement("bchc-modal") as typeof modal;
		second.view = args.view;
		canvasElement.append(second);
		await waitFor(() =>
			expect(second.shadowRoot?.querySelector(".overlay")).not.toBeNull(),
		);

		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		expect(root.style.overflow).toBe("hidden");

		second.remove();
		expect(root.style.overflow).toBe("");
	},
});

// Removing the element while open (`disconnectedCallback`) unlocks too,
// synchronously, with no event round trip to wait for.
export const ScrollUnlockedWhenRemoved = meta.story({
	render: withTallPage,
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const root = document.documentElement;

		// Closed and reset first, so this story's own (clean) baseline is
		// what gets saved when it reopens below (the document is shared with
		// the other stories in this file).
		modal.view = null;
		await waitFor(() => expect(shadow.querySelector(".overlay")).toBeNull());
		root.style.overflow = "";
		modal.view = args.view;
		await waitFor(() =>
			expect(shadow.activeElement).toBe(shadow.querySelector(".card")),
		);
		expect(root.style.overflow).toBe("hidden");

		modal.remove();
		expect(root.style.overflow).toBe("");
	},
});
