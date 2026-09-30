import type { BchcModal, ProtocolId, WalletSupport } from "@bchconnect/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_ADDRESS } from "../content";
import type { DemoState, UiModule } from "../lib/modal-demo";
import {
	loadUi,
	paint,
	RELAY_DELAY_MS,
	theme,
	watchSiteMode,
} from "../lib/modal-demo";

export type ConnectStatus =
	| "idle"
	| "loading"
	| "open"
	| "connected"
	| "failed";

export interface DemoSession {
	readonly walletName: string;
	readonly walletLogo: string;
	readonly protocol: ProtocolId;
	readonly address: string;
}

/** How long the wallet takes to approve once a row is picked, so the moment reads as a round trip. */
const APPROVE_DELAY_MS = 600;

/**
 * Runs the whole connect flow against the real modal and toast: pick a
 * protocol, pick a wallet, the wallet approves, the modal closes, and the
 * page holds a session. Nothing reaches a wallet.
 */
export function useConnectDemo() {
	const [status, setStatus] = useState<ConnectStatus>("idle");
	const [protocol, setProtocol] = useState<ProtocolId>("wizardconnect");
	const [session, setSession] = useState<DemoSession | null>(null);
	/** The control that opened the modal, or the account that replaced it. */
	const controlRef = useRef<HTMLButtonElement>(null);
	const refocus = useRef(false);
	const modalRef = useRef<BchcModal | null>(null);
	const approved = useRef<DemoSession | null>(null);
	const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
	const state = useRef<DemoState>({
		screen: "connect",
		protocol: "wizardconnect",
		initiating: false,
	});

	const later = useCallback((ms: number, run: () => void) => {
		const timer = setTimeout(() => {
			timers.current.delete(timer);
			run();
		}, ms);
		timers.current.add(timer);
	}, []);

	const clearTimers = useCallback(() => {
		for (const timer of timers.current) clearTimeout(timer);
		timers.current.clear();
	}, []);

	const render = useCallback((mod: UiModule) => {
		if (modalRef.current !== null) paint(mod, modalRef.current, state.current);
	}, []);

	const choose = useCallback(
		(mod: UiModule, next: ProtocolId) => {
			clearTimers();
			state.current.protocol = next;
			state.current.initiating = next === "walletconnect";
			setProtocol(next);
			if (state.current.initiating) {
				later(RELAY_DELAY_MS, () => {
					state.current.initiating = false;
					render(mod);
				});
			}
			render(mod);
		},
		[clearTimers, later, render],
	);

	const approve = useCallback(
		(wallet: WalletSupport) => {
			if (approved.current !== null) return;
			approved.current = {
				walletName: wallet.name,
				walletLogo: wallet.logo,
				protocol: state.current.protocol,
				address: DEMO_ADDRESS,
			};
			later(APPROVE_DELAY_MS, () => void modalRef.current?.close());
		},
		[later],
	);

	const onClosed = useCallback(() => {
		clearTimers();
		modalRef.current?.remove();
		modalRef.current = null;
		const next = approved.current;
		approved.current = null;
		refocus.current = true;
		if (next === null) {
			setStatus("idle");
			return;
		}
		setSession(next);
		setStatus("connected");
		const toast = theme(document.createElement("bchc-toast"));
		toast.view = { walletName: next.walletName, walletLogo: next.walletLogo };
		toast.addEventListener("bchc-dismiss", () => toast.remove());
		document.body.append(toast);
	}, [clearTimers]);

	const open = useCallback(async () => {
		if (status === "loading" || status === "open") return;
		setStatus("loading");
		let mod: UiModule;
		try {
			mod = await loadUi();
		} catch {
			setStatus("failed");
			return;
		}
		mod.defineElements();
		const modal = document.createElement("bchc-modal");
		modal.addEventListener("bchc-close", onClosed);
		modal.addEventListener("bchc-screen", (event) => {
			state.current.screen = event.detail.screen;
			render(mod);
		});
		modal.addEventListener("bchc-protocol", (event) =>
			choose(mod, event.detail.protocol),
		);
		// Wallet rows and "Open in your wallet" would leave the page; here they stand in for the wallet approving.
		modal.shadowRoot?.addEventListener(
			"click",
			(event) => {
				if (state.current.screen !== "connect") return;
				const target = event.target;
				if (!(target instanceof Element)) return;
				const link = target.closest("a.wallet[data-id], a[data-act='open']");
				if (link === null) return;
				event.preventDefault();
				const id = link.getAttribute("data-id");
				const wallet = mod.BCHC_WALLETS.find((entry) =>
					id === null
						? entry.protocols.includes(state.current.protocol)
						: entry.id === id,
				);
				if (wallet !== undefined) approve(wallet);
			},
			true,
		);
		modalRef.current = modal;
		state.current.screen = "connect";
		choose(mod, "wizardconnect");
		document.body.append(modal);
		setStatus("open");
	}, [approve, choose, onClosed, render, status]);

	const disconnect = useCallback(() => {
		refocus.current = true;
		setSession(null);
		setStatus("idle");
	}, []);

	/** Starts the import early, so the click that follows finds it loaded. */
	const preload = useCallback(() => {
		void loadUi().catch(() => {});
	}, []);

	// The control swaps between the button and the account, so focus follows the one on screen.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs after each status change, by design.
	useEffect(() => {
		if (!refocus.current) return;
		refocus.current = false;
		controlRef.current?.focus();
	}, [status]);

	useEffect(() => {
		const handle = window.requestIdleCallback?.(preload);
		return () => {
			if (handle !== undefined) window.cancelIdleCallback(handle);
		};
	}, [preload]);

	useEffect(
		() =>
			watchSiteMode(() => {
				if (modalRef.current !== null) void loadUi().then(render);
			}),
		[render],
	);

	useEffect(
		() => () => {
			clearTimers();
			modalRef.current?.remove();
		},
		[clearTimers],
	);

	return {
		status,
		protocol,
		session,
		open,
		disconnect,
		preload,
		controlRef,
	};
}
