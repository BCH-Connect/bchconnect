// The scripted demo behind the landing's connect flow. Nothing here reaches a
// wallet: the sample codes mirror the lab harness (packages/ui/lab/lab.js),
// and links are never logged.
//
// The package defines custom elements when it is evaluated, so it is loaded
// with `loadUi()` from callbacks and effects, never imported at module scope.

import type {
	BchcModal,
	ModalScreen,
	ModalView,
	ProtocolId,
} from "@bchconnect/ui";
import { LAB_ATTRIBUTE, LAB_NEUTRAL, labAccent } from "@/accent-lab/state";

export type UiModule = typeof import("@bchconnect/ui");

export interface DemoState {
	screen: ModalScreen;
	protocol: ProtocolId;
	initiating: boolean;
}

/** How long WalletConnect's relay takes to hand back a link, mirroring the lab harness. */
export const RELAY_DELAY_MS = 1500;

/** Sample connection codes, one per protocol; sourced from the lab harness. Never real sessions. */
const SAMPLE_LINKS: Readonly<Record<ProtocolId, string>> = {
	wizardconnect:
		"WIZ://%3FP%3DLDT6EGH3WX8C47LZ4XFZ0EUFHUWVPMZPVHJEX4PP3ZMHD63SQFNQ%26S%3DQK7G6VT7GMDTV",
	walletconnect:
		"wc:f351dbe7d12d683faad485fd648e4c1e8db60bf14258129bbe5aab111c2ba4a0@2?expiryTimestamp=1790141761&relay-protocol=irn&symKey=b20098400b519b8bcf583df011d74fad8b0020817d518a2e035b406acc00bc96",
	cashconnect:
		"bch-cc-v1:f40b68af88ef5de4f1a0a52a405d50e079bd7a6a36db7723b879650e5fc01c7d?relay=wss%3A%2F%2Fnostr.infra.cash",
};

let modulePromise: Promise<UiModule> | null = null;

export function loadUi(): Promise<UiModule> {
	modulePromise ??= import("@bchconnect/ui").catch((error: unknown) => {
		// A failed import must not be cached, or a retry would never reach the network.
		modulePromise = null;
		throw error;
	});
	return modulePromise;
}

export function siteMode(): "dark" | "light" {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Gives an element of the package the site's mode, accent and face. */
export function theme<E extends HTMLElement>(element: E): E {
	const accent = labAccent();
	element.setAttribute("data-bchc-accent", accent);
	element.setAttribute("data-bchc-neutral", LAB_NEUTRAL[accent]);
	element.setAttribute("data-bchc-mode", siteMode());
	// The library's font option, set to the site's own face so the modal reads as part of the page.
	element.style.setProperty("--bchc-font-brand-family", "var(--font-sans)");
	return element;
}

/** Writes the demo's state onto the modal. Wallet rows link to `#<id>`, which the caller intercepts. */
export function paint(mod: UiModule, modal: BchcModal, state: DemoState): void {
	const view: ModalView = {
		screen: state.screen,
		protocol: state.protocol,
		protocols: mod.BCHC_PROTOCOLS,
		wallets: mod.BCHC_WALLETS.filter((wallet) =>
			wallet.protocols.includes(state.protocol),
		).map((wallet) => ({
			id: wallet.id,
			name: wallet.name,
			logo: wallet.logo,
			href: `#${wallet.id}`,
		})),
		directory: mod.BCHC_DIRECTORY,
		network: "mainnet",
		phase: state.initiating
			? { kind: "initiating" }
			: { kind: "awaiting-approval", link: SAMPLE_LINKS[state.protocol] },
	};
	theme(modal);
	modal.view = view;
}

/** Calls `onChange` whenever the site switches between light and dark, or the accent lab switches accent. */
export function watchSiteMode(onChange: () => void): () => void {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", LAB_ATTRIBUTE],
	});
	return () => observer.disconnect();
}
