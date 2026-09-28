// Mounts the real `<bchc-modal>` on first interaction and drives it through
// a scripted demo. Nothing here connects to a wallet: the sample codes mirror
// the lab harness (packages/ui/lab/lab.js), and links are never logged.
//
// The package is never imported at module scope — only inside event
// handlers — so this file stays SSR-safe without any client-only wrapper.

import type {
	BchcModal,
	ModalScreen,
	ModalView,
	ProtocolId,
} from "@bchconnect/ui";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

type UiModule = typeof import("@bchconnect/ui");

/** Sample connection codes, one per protocol; sourced from the lab harness. Never real sessions. */
const SAMPLE_LINKS: Readonly<Record<ProtocolId, string>> = {
	wizardconnect:
		"WIZ://%3FP%3DLDT6EGH3WX8C47LZ4XFZ0EUFHUWVPMZPVHJEX4PP3ZMHD63SQFNQ%26S%3DQK7G6VT7GMDTV",
	walletconnect:
		"wc:f351dbe7d12d683faad485fd648e4c1e8db60bf14258129bbe5aab111c2ba4a0@2?expiryTimestamp=1790141761&relay-protocol=irn&symKey=b20098400b519b8bcf583df011d74fad8b0020817d518a2e035b406acc00bc96",
	cashconnect:
		"bch-cc-v1:f40b68af88ef5de4f1a0a52a405d50e079bd7a6a36db7723b879650e5fc01c7d?relay=wss%3A%2F%2Fnostr.infra.cash",
};

/** Where each demo wallet row goes; the vendor's own site, since nothing here actually pairs. */
const WALLET_HOMEPAGE: Readonly<Record<string, string>> = {
	cashonize: "https://cashonize.com",
	selene: "https://selene.cash",
	paytaca: "https://paytaca.com",
	optn: "https://optn.cash",
};

/** How long WalletConnect's relay takes to hand back a link, mirroring the lab harness. */
const RELAY_DELAY_MS = 1500;

let modulePromise: Promise<UiModule> | null = null;

function loadModule(): Promise<UiModule> {
	modulePromise ??= import("@bchconnect/ui");
	return modulePromise;
}

function isDark(): boolean {
	return document.documentElement.classList.contains("dark");
}

/**
 * Opens the real connect modal as a themed overlay. Falls back to a plain
 * link to the concepts guide if the module can't be loaded at all.
 */
export function ConnectDemo() {
	const [unavailable, setUnavailable] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const modalRef = useRef<BchcModal | null>(null);
	const relayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const demoState = useRef<{
		screen: ModalScreen;
		protocol: ProtocolId;
		initiating: boolean;
	}>({
		screen: "connect",
		protocol: "wizardconnect",
		initiating: false,
	});

	const buildView = useCallback((mod: UiModule): ModalView => {
		const { screen, protocol, initiating } = demoState.current;
		const wallets = mod.BCHC_WALLETS.filter((wallet) =>
			wallet.protocols.includes(protocol),
		).map((wallet) => ({
			id: wallet.id,
			name: wallet.name,
			logo: wallet.logo,
			href: WALLET_HOMEPAGE[wallet.id] ?? null,
		}));
		return {
			screen,
			protocol,
			protocols: mod.BCHC_PROTOCOLS,
			wallets,
			directory: mod.BCHC_DIRECTORY,
			network: "mainnet",
			phase: initiating
				? { kind: "initiating" }
				: { kind: "awaiting-approval", link: SAMPLE_LINKS[protocol] },
		};
	}, []);

	const refresh = useCallback(async () => {
		const modal = modalRef.current;
		if (modal === null) return;
		const mod = await loadModule();
		// biome-ignore lint/complexity/useLiteralKeys: dot access is rejected under noPropertyAccessFromIndexSignature
		modal.dataset["bchcMode"] = isDark() ? "dark" : "light";
		modal.view = buildView(mod);
	}, [buildView]);

	const setInitiating = useCallback(
		(initiating: boolean) => {
			demoState.current.initiating = initiating;
			if (relayTimer.current !== null) clearTimeout(relayTimer.current);
			relayTimer.current = initiating
				? setTimeout(() => {
						relayTimer.current = null;
						demoState.current.initiating = false;
						void refresh();
					}, RELAY_DELAY_MS)
				: null;
			void refresh();
		},
		[refresh],
	);

	const close = useCallback(() => {
		modalRef.current?.remove();
		modalRef.current = null;
		if (relayTimer.current !== null) {
			clearTimeout(relayTimer.current);
			relayTimer.current = null;
		}
		demoState.current = {
			screen: "connect",
			protocol: "wizardconnect",
			initiating: false,
		};
		buttonRef.current?.focus();
	}, []);

	const open = useCallback(async () => {
		if (modalRef.current !== null) return;
		let mod: UiModule;
		try {
			mod = await loadModule();
		} catch {
			setUnavailable(true);
			return;
		}
		mod.defineElements();
		const modal = document.createElement("bchc-modal");
		// biome-ignore lint/complexity/useLiteralKeys: dot access is rejected under noPropertyAccessFromIndexSignature
		modal.dataset["bchcAccent"] = "green";
		// biome-ignore lint/complexity/useLiteralKeys: dot access is rejected under noPropertyAccessFromIndexSignature
		modal.dataset["bchcMode"] = isDark() ? "dark" : "light";
		modal.view = buildView(mod);
		modal.addEventListener("bchc-close", close);
		modal.addEventListener("bchc-screen", (event) => {
			demoState.current.screen = event.detail.screen;
			void refresh();
		});
		modal.addEventListener("bchc-protocol", (event) => {
			demoState.current.protocol = event.detail.protocol;
			setInitiating(event.detail.protocol === "walletconnect");
		});
		document.body.append(modal);
		modalRef.current = modal;
	}, [buildView, close, refresh, setInitiating]);

	const preload = useCallback(() => {
		loadModule().catch(() => setUnavailable(true));
	}, []);

	// Follows the site's own theme switch while the modal is open.
	useEffect(() => {
		const observer = new MutationObserver(() => void refresh());
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, [refresh]);

	useEffect(
		() => () => {
			modalRef.current?.remove();
			if (relayTimer.current !== null) clearTimeout(relayTimer.current);
		},
		[],
	);

	if (unavailable) {
		return (
			<Link
				to="/docs/$"
				// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
				params={{ _splat: "concepts" }}
				className="landing-cta-primary"
			>
				Connect wallet
			</Link>
		);
	}

	return (
		<button
			ref={buttonRef}
			type="button"
			className="landing-cta-primary"
			onPointerEnter={preload}
			onFocus={preload}
			onClick={() => void open()}
		>
			Connect wallet
		</button>
	);
}
