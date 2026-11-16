// The landing's UI showcase: the real `<bchc-modal>` from the package's
// standalone entry, with no core, connector or session behind it. It never
// connects; the sample codes mirror the lab harness (packages/ui/lab/lab.js).
//
// The package defines custom elements when it is evaluated, so it is loaded
// with `loadUi()` from callbacks and effects, never imported at module scope.

import type {
	BchcAccent,
	BchcModal,
	BchcRadius,
	ModalScreen,
	ModalView,
	ProtocolId,
} from "@bchconnect/ui";

export type UiModule = typeof import("@bchconnect/ui");

/** How long WalletConnect's relay takes to hand back a link, mirroring the lab harness. */
const RELAY_DELAY_MS = 1500;

/** Sample connection codes, one per protocol; sourced from the lab harness. Never real sessions. */
const SAMPLE_LINKS: Readonly<Record<ProtocolId, string>> = {
	wizardconnect:
		"WIZ://%3FP%3DLDT6EGH3WX8C47LZ4XFZ0EUFHUWVPMZPVHJEX4PP3ZMHD63SQFNQ%26S%3DQK7G6VT7GMDTV",
	"bch-wc2":
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

/** The theming options the demos set; the site's own are the default. */
export interface Look {
	readonly accent: BchcAccent;
	readonly radius?: BchcRadius;
	/** Defaults to the site's own mode. */
	readonly mode?: "dark" | "light";
}

const SITE_LOOK: Look = { accent: "violet" };

/** Gives an element of the package the site's mode, accent and face. */
export function theme<E extends HTMLElement>(element: E, look = SITE_LOOK): E {
	element.setAttribute("data-bchc-accent", look.accent);
	element.setAttribute("data-bchc-neutral", "slate");
	if (look.radius !== undefined) {
		element.setAttribute("data-bchc-radius", look.radius);
	}
	element.setAttribute("data-bchc-mode", look.mode ?? siteMode());
	element.style.setProperty("--bchc-font-brand-family", "var(--font-sans)");
	return element;
}

interface ShowcaseState {
	screen: ModalScreen;
	protocol: ProtocolId;
	wallet: string | null;
	initiating: boolean;
}

/**
 * Drives `modal` from its own `bchc-wallet`, `bchc-protocol` and
 * `bchc-screen` events, the way a connection ui would, minus the attempt.
 * Returns a repaint for when `look()` changes.
 */
export function driveShowcase(
	mod: UiModule,
	modal: BchcModal,
	look: () => Look,
): () => void {
	const protocols = mod.BCHC_PROTOCOLS;
	const enabled = protocols.map((entry) => entry.id);
	const wallets = mod.BCHC_WALLETS.filter((wallet) =>
		wallet.protocols.some((id) => enabled.includes(id)),
	);
	const state: ShowcaseState = {
		screen: "connect",
		protocol:
			enabled.find((id) => wallets[0]?.protocols.includes(id)) ??
			enabled[0] ??
			"wizardconnect",
		wallet: null,
		initiating: false,
	};
	let relay: number | undefined;

	const paint = () => {
		const view: ModalView = {
			screen: state.screen,
			protocol: state.protocol,
			protocols,
			wallets,
			wallet: state.wallet,
			directory: mod.BCHC_DIRECTORY,
			network: "mainnet",
			phase: state.initiating
				? { kind: "initiating" }
				: { kind: "awaiting-approval", link: SAMPLE_LINKS[state.protocol] },
		};
		theme(modal, look());
		modal.view = view;
	};

	const select = (protocol: ProtocolId) => {
		window.clearTimeout(relay);
		state.protocol = protocol;
		state.initiating = protocol === "bch-wc2";
		if (state.initiating) {
			relay = window.setTimeout(() => {
				state.initiating = false;
				paint();
			}, RELAY_DELAY_MS);
		}
	};

	modal.addEventListener("bchc-wallet", (event) => {
		state.wallet = event.detail.wallet;
		paint();
	});
	modal.addEventListener("bchc-protocol", (event) => {
		if (!enabled.includes(event.detail.protocol)) return;
		select(event.detail.protocol);
		paint();
	});
	modal.addEventListener("bchc-screen", (event) => {
		state.screen = event.detail.screen;
		paint();
	});
	modal.addEventListener("bchc-close", () => window.clearTimeout(relay), {
		once: true,
	});
	// The modal contains overscroll for a full-window overlay; framed in the
	// landing, that would trap the page's scroll under the card.
	if (modal.shadowRoot !== null) {
		const release = new CSSStyleSheet();
		release.replaceSync(".body, .wallets { overscroll-behavior: auto; }");
		modal.shadowRoot.adoptedStyleSheets = [
			...modal.shadowRoot.adoptedStyleSheets,
			release,
		];
	}
	// Wallet links carry the sample code; following one would open a real wallet with it.
	modal.shadowRoot?.addEventListener(
		"click",
		(event) => {
			if (event.target instanceof Element && event.target.closest("a[href]"))
				event.preventDefault();
		},
		true,
	);

	select(state.protocol);
	paint();
	return paint;
}
