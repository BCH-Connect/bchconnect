// The shipped elements as a ModalRenderer. Element code, Lit and the QR
// library load on the first open(), so a client created on a server pays nothing.

import type { ConnectUi } from "@bchconnect/core";
import {
	type HeadlessModalOptions,
	headlessModal,
	type ModalRenderer,
} from "./headless.ts";
import type { BchcMessages } from "./messages.ts";
import type { BchcModal } from "./modal.ts";
import { SHEET_QUERY } from "./sheet-query.ts";
import type { ModalView } from "./state.ts";
import type {
	BchcAccent,
	BchcBlur,
	BchcFont,
	BchcMode,
	BchcNeutral,
	BchcRadius,
} from "./theme.generated.ts";

/**
 * The look of the modal and the toast. Each value is written to the element
 * as its `data-bchc-*` attribute; an omitted one keeps the default.
 *
 * @beta
 */
export interface BchconnectModalTheme {
	/** Accent colour. */
	accent?: BchcAccent;
	/** Neutral family. Defaults to the accent's pairing. */
	neutral?: BchcNeutral;
	/** Corner radius. */
	radius?: BchcRadius;
	/** Font family. */
	font?: BchcFont;
	/** Backdrop blur. */
	blur?: BchcBlur;
	/** Colour scheme. Defaults to following the system. */
	mode?: BchcMode;
}

// The option types it reaches, so a dapp can import this entry alone.
export type { HeadlessModalOptions, ModalDefaults } from "./headless.ts";

/**
 * Options for {@link bchconnectModal}.
 *
 * @beta
 */
export interface BchconnectModalOptions extends HeadlessModalOptions {
	/** Partial catalogue merged over English, for the modal and the toast. */
	messages?: Partial<BchcMessages>;
	/** The look of the modal and the toast. */
	theme?: BchconnectModalTheme;
	/**
	 * Show `bchc-toast` once connected, optionally with how long it stays in
	 * milliseconds. Defaults to `true`.
	 */
	toast?: boolean | { duration?: number };
}

/**
 * What {@link bchconnectModal} returns: the client's `ui`, plus a way to
 * change its look later.
 *
 * @beta
 */
export interface BchconnectModalUi extends ConnectUi {
	/**
	 * Replaces the theme of the modal and the toast, including those on
	 * screen. An axis the new theme leaves out goes back to its default.
	 *
	 * @example
	 * ```ts
	 * const ui = bchconnectModal({ theme: { accent: "violet", mode: "light" } });
	 * // Later, when the site's own theme changes:
	 * ui.setTheme({ accent: "violet", mode: "dark" });
	 * ```
	 */
	setTheme(theme: BchconnectModalTheme): void;
}

const THEME_AXES: Readonly<Record<keyof BchconnectModalTheme, true>> = {
	accent: true,
	neutral: true,
	radius: true,
	font: true,
	blur: true,
	mode: true,
};

function applyTheme(element: HTMLElement, theme: BchconnectModalTheme) {
	for (const axis of Object.keys(
		THEME_AXES,
	) as (keyof BchconnectModalTheme)[]) {
		const value = theme[axis];
		if (value === undefined) element.removeAttribute(`data-bchc-${axis}`);
		else element.setAttribute(`data-bchc-${axis}`, value);
	}
}

function elementsRenderer(
	options: BchconnectModalOptions,
): ModalRenderer & Pick<BchconnectModalUi, "setTheme"> {
	let latest: ModalView | null = null;
	let modal: BchcModal | null = null;
	let mounted: Promise<void> = Promise.resolve();
	let closing = false;
	let theme: BchconnectModalTheme = options.theme ?? {};
	const toasts = new Set<HTMLElement>();

	function showToast(view: ModalView) {
		if (options.toast === false || view.phase.kind !== "connected") return;
		const toast = document.createElement("bchc-toast");
		applyTheme(toast, theme);
		if (
			typeof options.toast === "object" &&
			options.toast.duration !== undefined
		) {
			toast.duration = options.toast.duration;
		}
		toast.view = {
			walletName: view.phase.walletName,
			walletLogo: view.phase.walletLogo,
		};
		if (options.messages !== undefined) toast.messages = options.messages;
		toast.addEventListener(
			"bchc-dismiss",
			() => {
				toasts.delete(toast);
				toast.remove();
			},
			{ once: true },
		);
		toasts.add(toast);
		document.body.append(toast);
	}

	return {
		open(view, actions) {
			latest = view;
			closing = false;
			mounted = import("./define.ts").then(({ defineElements }) => {
				if (closing) return;
				defineElements();
				const element = document.createElement("bchc-modal");
				applyTheme(element, theme);
				if (options.messages !== undefined) {
					element.messages = options.messages;
				}
				element.view = latest;
				element.addEventListener("bchc-wallet", (event) =>
					actions.selectWallet(event.detail.wallet),
				);
				element.addEventListener("bchc-protocol", (event) =>
					actions.selectProtocol(event.detail.protocol),
				);
				element.addEventListener("bchc-screen", (event) =>
					actions.showScreen(event.detail.screen),
				);
				element.addEventListener("bchc-retry", () => actions.retry());
				element.addEventListener(
					"bchc-close",
					() => {
						element.remove();
						if (!closing) actions.dismiss();
					},
					{ once: true },
				);
				modal = element;
				document.body.append(element);
			});
			// Without its code there is no modal to close, so the call ends here.
			mounted.catch(() => actions.dismiss());
		},
		update(view) {
			latest = view;
			if (modal !== null) modal.view = view;
		},
		// The drawer lists no wallets, so the person never saw the selection.
		showsWallets() {
			return !matchMedia(SHEET_QUERY).matches;
		},
		async close() {
			closing = true;
			await mounted;
			const element = modal;
			modal = null;
			if (element === null) return;
			await element.close();
			element.remove();
			if (latest !== null) showToast(latest);
		},
		setTheme(next) {
			theme = next;
			if (modal !== null) applyTheme(modal, theme);
			for (const toast of toasts) {
				// A toast the page removed itself never sends `bchc-dismiss`.
				if (toast.isConnected) applyTheme(toast, theme);
				else toasts.delete(toast);
			}
		},
	};
}

/**
 * The default connection UI: the shipped modal, then `bchc-toast` once
 * connected. Pass it as the client's `ui`.
 *
 * @example
 * ```ts
 * import { createClient } from "@bchconnect/core";
 * import { bchconnectModal } from "@bchconnect/ui/modal";
 *
 * const client = createClient({
 *   connectors,
 *   network: "mainnet",
 *   appMetadata,
 *   ui: bchconnectModal(),
 * });
 * await client.init();
 * const session = await client.connect();
 * ```
 *
 * @beta
 */
export function bchconnectModal(
	options: BchconnectModalOptions = {},
): BchconnectModalUi {
	const renderer = elementsRenderer(options);
	return { ...headlessModal(renderer, options), setTheme: renderer.setTheme };
}
