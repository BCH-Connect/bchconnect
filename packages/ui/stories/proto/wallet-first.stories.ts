// Throwaway: the wallet-first prototype (odd/tasks/ui-wallet-first.md, T1). A small
// stateful harness stands in for the client so selection, switching and retry are real.

import { waitForAnimations } from "storybook/preview-api";
import { expect, userEvent, waitFor } from "storybook/test";
import preview, {
	resolveMessages,
	resolveMode,
} from "../../.storybook/preview.ts";
import {
	BCHC_DIRECTORY,
	BCHC_PROTOCOLS,
	BCHC_WALLETS,
} from "../../src/defaults.ts";
import type {
	ConnectPhase,
	FailureReason,
	ModalScreen,
	ProtocolId,
} from "../../src/state.ts";
import { PROTOCOL_LINKS } from "../fixtures.ts";
import { THEME_ARG_TYPES, type ThemeArgs } from "../theme.ts";
import "./wallet-first-modal.ts";
import type {
	BchcProtoModal,
	ProtoControl,
	ProtoOpenPlacement,
	ProtoView,
	ProtoWallet,
} from "./wallet-first-modal.ts";

// Selene shipped WizardConnect in v2026.10.01 (T6 updates BCHC_WALLETS itself).
// Desktop links: only wallets that run on a desktop get one. Cashonize's web app reads
// `?uri=` on its root route and accepts wc:, CashConnect and wiz: links (its
// `isDappConnectionUri`), so the live link rides along and opens prefilled. optn.cash is
// the wallet's site, not the wallet.
const DESKTOP_HREF: Readonly<Record<string, string | null>> = {
	cashonize: "https://cashonize.com/?uri={link}",
	optn: null,
	paytaca: null,
	selene: null,
};

const ALL_WALLETS: readonly ProtoWallet[] = BCHC_WALLETS.map((wallet) => ({
	id: wallet.id,
	name: wallet.name,
	logo: wallet.logo,
	href: DESKTOP_HREF[wallet.id] ?? null,
	protocols:
		wallet.id === "selene"
			? ["wizardconnect", ...wallet.protocols]
			: wallet.protocols,
}));

const RELAY_DELAY = 900;

interface ProtoArgs extends ThemeArgs {
	readonly control: ProtoControl;
	readonly openPlacement: ProtoOpenPlacement;
	/** The consumer's enabled session types, in `BCHC_PROTOCOLS` order. */
	readonly protocols: readonly ProtocolId[];
	/** The consumer's default; falls back to the first enabled one. */
	readonly defaultProtocol: ProtocolId;
	/** `null` takes the default: the first listed wallet that speaks the default protocol. */
	readonly selected: string | null;
	readonly failure: FailureReason | "none";
}

function mount(
	args: ProtoArgs,
	context: { globals: { readonly mode?: unknown; readonly locale?: unknown } },
): HTMLElement {
	const element = document.createElement("bchc-proto-modal") as BchcProtoModal;
	const theme: Record<string, string | undefined> = {
		"data-bchc-accent": args.accent,
		"data-bchc-neutral": args.neutral,
		"data-bchc-radius": args.radius,
		"data-bchc-font": args.font,
		"data-bchc-blur": args.backdropBlur,
		"data-bchc-mode": resolveMode(context.globals),
	};
	for (const [name, value] of Object.entries(theme))
		if (value !== undefined) element.setAttribute(name, value);
	element.control = args.control;
	element.openPlacement = args.openPlacement;
	element.messages = resolveMessages(context.globals);

	const enabled = BCHC_PROTOCOLS.filter((entry) =>
		args.protocols.includes(entry.id),
	);
	const wallets = ALL_WALLETS.filter((wallet) =>
		wallet.protocols.some((id) => args.protocols.includes(id)),
	);
	const firstFor = (wallet: ProtoWallet | undefined): ProtocolId => {
		const preferred = enabled.some((entry) => entry.id === args.defaultProtocol)
			? args.defaultProtocol
			: (enabled[0]?.id ?? "wizardconnect");
		if (wallet === undefined || wallet.protocols.includes(preferred))
			return preferred;
		return (
			enabled.find((entry) => wallet.protocols.includes(entry.id))?.id ??
			preferred
		);
	};

	let screen: ModalScreen = "connect";
	// Wallet-driven: like the protocol, a wallet is always chosen. The default is the first
	// listed wallet that speaks the default protocol.
	const defaultWallet = (): string | null => {
		const preferred = firstFor(undefined);
		return (
			wallets.find((wallet) => wallet.protocols.includes(preferred))?.id ??
			wallets[0]?.id ??
			null
		);
	};
	let selected = wallets.some((wallet) => wallet.id === args.selected)
		? args.selected
		: defaultWallet();
	let protocol = firstFor(wallets.find((wallet) => wallet.id === selected));
	let phase: ConnectPhase =
		args.failure === "none"
			? { kind: "initiating" }
			: { kind: "failed", reason: args.failure };
	let attempt = 0;

	const push = (): void => {
		const view: ProtoView = {
			screen,
			protocol,
			protocols: enabled,
			wallets,
			directory: BCHC_DIRECTORY,
			network: "mainnet",
			phase,
			selected,
		};
		element.view = view;
	};

	// WizardConnect's link needs no round trip; the relay protocols wait on one.
	const connect = (): void => {
		attempt += 1;
		const current = attempt;
		const live: ConnectPhase = {
			kind: "awaiting-approval",
			link: PROTOCOL_LINKS[protocol],
		};
		if (protocol === "wizardconnect") {
			phase = live;
			push();
			return;
		}
		phase = { kind: "initiating" };
		push();
		setTimeout(() => {
			if (current !== attempt) return;
			phase = live;
			push();
		}, RELAY_DELAY);
	};

	element.addEventListener("bchc-wallet", (event) => {
		selected = (event as CustomEvent<{ wallet: string }>).detail.wallet;
		const wallet = wallets.find((entry) => entry.id === selected);
		const next =
			wallet !== undefined && !wallet.protocols.includes(protocol)
				? firstFor(wallet)
				: protocol;
		if (next !== protocol) {
			protocol = next;
			connect();
			return;
		}
		push();
	});
	element.addEventListener("bchc-protocol", (event) => {
		protocol = event.detail.protocol;
		connect();
	});
	element.addEventListener("bchc-retry", () => connect());
	element.addEventListener("bchc-screen", (event) => {
		screen = event.detail.screen;
		push();
	});
	// Reopens after a beat, so the prototype is never left empty.
	element.addEventListener("bchc-close", () => {
		element.view = null;
		setTimeout(() => {
			screen = "connect";
			selected = defaultWallet();
			protocol = firstFor(wallets.find((wallet) => wallet.id === selected));
			connect();
		}, 700);
	});

	if (args.failure === "none") connect();
	else push();
	return element;
}

const meta = preview.type<{ args: ProtoArgs }>().meta({
	title: "Prototypes/Wallet-first",
	component: "bchc-proto-modal",
	argTypes: {
		...THEME_ARG_TYPES,
		control: { options: ["dropdown", "tabs"], control: "inline-radio" },
		openPlacement: { options: ["footer", "row"], control: "inline-radio" },
		protocols: {
			options: BCHC_PROTOCOLS.map((entry) => entry.id),
			control: "inline-check",
		},
		defaultProtocol: {
			options: BCHC_PROTOCOLS.map((entry) => entry.id),
			control: "select",
		},
		selected: {
			options: [null, ...ALL_WALLETS.map((wallet) => wallet.id)],
			control: "select",
		},
		failure: {
			options: [
				"none",
				"rejected",
				"timeout",
				"aborted",
				"transport",
				"network-mismatch",
				"unsupported",
			],
			control: "select",
		},
	},
	args: {
		control: "tabs",
		openPlacement: "footer",
		protocols: ["wizardconnect", "walletconnect", "cashconnect"],
		defaultProtocol: "wizardconnect",
		selected: null,
		failure: "none",
	},
	render: mount,
	play: async () => {
		await waitForAnimations();
	},
});

function shadowOf(canvasElement: HTMLElement): ShadowRoot {
	const root = canvasElement.querySelector("bchc-proto-modal")?.shadowRoot;
	if (root === null || root === undefined)
		throw new Error("bchc-proto-modal did not render");
	return root;
}

function tabNames(shadow: ShadowRoot): string[] {
	return Array.from(
		shadow.querySelectorAll<HTMLElement>(".tab-name"),
		(tab) => tab.textContent ?? "",
	);
}

export const Desktop = meta.story({
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const shadow = shadowOf(canvasElement);
		// Cashonize opens with the live link filled in.
		const open = shadow.querySelector('a[data-act="open-wallet"]');
		expect(open?.getAttribute("href")).toBe(
			`https://cashonize.com/?uri=${encodeURIComponent(PROTOCOL_LINKS.wizardconnect)}`,
		);
	},
});

export const OpenOnRow = meta.story({ args: { openPlacement: "row" } });

// Paytaca has no CashConnect: its tab must go, and choosing Paytaca while on
// CashConnect falls back to the default (A2).
export const NarrowsToPaytaca = meta.story({
	args: { defaultProtocol: "cashconnect" },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const shadow = shadowOf(canvasElement);
		expect(tabNames(shadow)).toEqual([
			"WizardConnect",
			"WalletConnect",
			"CashConnect",
		]);
		const paytaca = shadow.querySelector('[data-wallet="paytaca"]');
		if (!(paytaca instanceof HTMLElement))
			throw new Error("Paytaca row missing");
		await userEvent.click(paytaca);
		await waitFor(() =>
			expect(tabNames(shadow)).toEqual(["WizardConnect", "WalletConnect"]),
		);
		expect(
			shadow.querySelector('.tab[aria-selected="true"] .tab-name')?.textContent,
		).toBe("WizardConnect");
		expect(paytaca.getAttribute("aria-checked")).toBe("true");
		await waitForAnimations();
	},
});

export const TwoProtocols = meta.story({
	args: { protocols: ["wizardconnect", "walletconnect"] },
});

// One enabled protocol: an informational label, no control and no selected state.
export const SingleProtocol = meta.story({
	args: { protocols: ["wizardconnect"], selected: "selene" },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const shadow = shadowOf(canvasElement);
		expect(shadow.querySelector('[role="tablist"]')).toBeNull();
		expect(shadow.querySelector(".session-value")?.textContent).toBe(
			"WizardConnect",
		);
	},
});

// CashConnect only: just the wallets that speak it are listed (S7).
export const CashConnectOnly = meta.story({
	args: { protocols: ["cashconnect"] },
});

export const RelayInitiating = meta.story({
	args: { defaultProtocol: "walletconnect" },
});

export const Failure = meta.story({
	args: { selected: "paytaca", failure: "rejected" },
});

// The phone keeps its layout (S6): one generic "Open in your wallet" deep link, no wallet
// list; the session-type tabs sit above the code.
export const PhoneScan = meta.story({
	globals: { viewport: { value: "phone" } },
});

export const PhoneTwoProtocols = meta.story({
	args: { protocols: ["wizardconnect", "walletconnect"] },
	globals: { viewport: { value: "phone" } },
});

export const PhoneSingleProtocol = meta.story({
	args: { protocols: ["wizardconnect"] },
	globals: { viewport: { value: "phone" } },
});

export const PhoneRelayInitiating = meta.story({
	args: { defaultProtocol: "walletconnect" },
	globals: { viewport: { value: "phone" } },
});

export const PhoneFailure = meta.story({
	args: { failure: "rejected" },
	globals: { viewport: { value: "phoneSmall" } },
});

// Tabs are the chosen control (T2, 2026-10-21). The dropdown stays as unpublished work.
export const ArchivedDropdown = meta.story({ args: { control: "dropdown" } });
