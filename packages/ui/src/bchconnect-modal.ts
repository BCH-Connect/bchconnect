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
import type { ModalView } from "./state.ts";

/**
 * Options for {@link bchconnectModal}.
 *
 * @beta
 */
export interface BchconnectModalOptions extends HeadlessModalOptions {
	/** Partial catalogue merged over English, for the modal and the toast. */
	messages?: Partial<BchcMessages>;
	/** Show `bchc-toast` once connected. Defaults to `true`. */
	toast?: boolean;
}

function elementsRenderer(options: BchconnectModalOptions): ModalRenderer {
	let latest: ModalView | null = null;
	let modal: BchcModal | null = null;
	let mounted: Promise<void> = Promise.resolve();
	let closing = false;

	function showToast(view: ModalView) {
		if (options.toast === false || view.phase.kind !== "connected") return;
		const toast = document.createElement("bchc-toast");
		toast.view = {
			walletName: view.phase.walletName,
			walletLogo: view.phase.walletLogo,
		};
		if (options.messages !== undefined) toast.messages = options.messages;
		toast.addEventListener("bchc-dismiss", () => toast.remove(), {
			once: true,
		});
		document.body.append(toast);
	}

	return {
		open(view, actions) {
			latest = view;
			closing = false;
			mounted = import("./define.ts").then(({ defineElements }) => {
				defineElements();
				const element = document.createElement("bchc-modal");
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
		},
		update(view) {
			latest = view;
			if (modal !== null) modal.view = view;
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
	};
}

/**
 * The default connection UI: the shipped modal, then `bchc-toast` once
 * connected. Pass it as the client's `ui`.
 *
 * @example
 * ```ts
 * import { createClient } from "@bchconnect/core";
 * import { bchconnectModal } from "@bchconnect/ui";
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
): ConnectUi {
	return headlessModal(elementsRenderer(options), options);
}
