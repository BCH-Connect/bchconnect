// Wallet-first selection (SPEC §8.1): a wallet is always selected, it narrows the
// session-type tabs, names itself in the scan caption and carries its desktop link.

import { expect, fn, userEvent, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { BCHC_PROTOCOLS } from "../src/defaults.ts";
import { BCHC_MESSAGES_EN } from "../src/messages.ts";
import type { ProtocolOption, WalletOption } from "../src/state.ts";
import { PROTOCOL_LINKS, viewFor, walletsFor } from "./fixtures.ts";
import {
	detailOf,
	type ModalStoryArgs,
	modalHost,
	modalRender,
	modalShadow,
} from "./modal.ts";
import { settle } from "./settle.ts";
import { THEME_ARG_TYPES } from "./theme.ts";

const meta = preview.type<{ args: ModalStoryArgs }>().meta({
	component: "bchc-modal",
	argTypes: THEME_ARG_TYPES,
	args: { view: viewFor() },
	render: modalRender,
	play: async () => {
		await settle();
	},
});

const SHIPPED = walletsFor(BCHC_PROTOCOLS);

function shipped(id: string): WalletOption {
	const found = SHIPPED.find((wallet) => wallet.id === id);
	if (found === undefined) throw new Error(`fixture wallet missing: ${id}`);
	return found;
}

function row(shadow: ShadowRoot, id: string): HTMLButtonElement {
	const found = shadow.querySelector<HTMLButtonElement>(
		`[data-wallet="${id}"]`,
	);
	if (found === null) throw new Error(`wallet row missing: ${id}`);
	return found;
}

function tabIds(shadow: ShadowRoot): (string | null)[] {
	return [...shadow.querySelectorAll(".tab")].map((tab) =>
		tab.getAttribute("data-protocol"),
	);
}

function captionText(shadow: ShadowRoot): string | undefined {
	return shadow.querySelector(".caption-text")?.textContent?.trim();
}

// Records both selection events in the order they fire.
function recordSelection(modal: HTMLElement): string[] {
	const order: string[] = [];
	modal.addEventListener("bchc-wallet", (event) =>
		order.push(`wallet:${event.detail.wallet}`),
	);
	modal.addEventListener("bchc-protocol", (event) =>
		order.push(`protocol:${event.detail.protocol}`),
	);
	return order;
}

// With no `view.wallet`, the first listed wallet that speaks the protocol is selected:
// CashConnect here, which Paytaca and Selene lack, so OPTN.
export const DefaultSelection = meta.story({
	args: {
		view: viewFor({
			protocol: "cashconnect",
			wallets: ["paytaca", "selene", "optn", "cashonize"].map(shipped),
		}),
	},
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		const checked = [...shadow.querySelectorAll("[data-wallet]")].map(
			(wallet) => [
				wallet.getAttribute("data-wallet"),
				wallet.getAttribute("aria-checked"),
				String((wallet as HTMLElement).tabIndex),
			],
		);
		expect(checked).toEqual([
			["paytaca", "false", "-1"],
			["selene", "false", "-1"],
			["optn", "true", "0"],
			["cashonize", "false", "-1"],
		]);
		expect(shadow.querySelector(".wallets")?.getAttribute("role")).toBe(
			"radiogroup",
		);
		expect(captionText(shadow)).toBe(BCHC_MESSAGES_EN.scanWith("OPTN"));
		expect(
			shadow.querySelector(".caption-wallet .caption-mark"),
		).not.toBeNull();
	},
});

// An id that isn't listed falls back to the default instead of selecting nothing.
export const UnknownWallet = meta.story({
	args: { view: viewFor({ wallet: "not-listed" }) },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		expect(row(shadow, "cashonize").getAttribute("aria-checked")).toBe("true");
	},
});

// The tabs offer only what the selected wallet speaks, in the configured order.
export const TabsFollowWallet = meta.story({
	args: { view: viewFor({ wallet: "paytaca" }) },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		expect(tabIds(shadow)).toEqual(["wizardconnect", "bch-wc2"]);
		expect(shadow.querySelector(".tabs")).not.toHaveClass("is-dense");
		const tile = shadow.querySelector(".tile");
		expect(tile?.getAttribute("role")).toBe("tabpanel");
		expect(tile?.getAttribute("aria-labelledby")).toBe("tab-wizardconnect");

		// Selecting a wallet that speaks all three brings the third tab back.
		await userEvent.click(row(shadow, "cashonize"));
		await waitFor(() =>
			expect(tabIds(shadow)).toEqual([
				"wizardconnect",
				"bch-wc2",
				"cashconnect",
			]),
		);
		await settle();
	},
});

// A wallet that speaks the current session type keeps it: one event, no switch,
// and only the wallet's mark and name swap in the caption.
export const SelectWallet = meta.story({
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const order = recordSelection(modal);

		await userEvent.click(row(shadow, "paytaca"));
		expect(order).toEqual(["wallet:paytaca"]);
		await waitFor(() =>
			expect(row(shadow, "paytaca").getAttribute("aria-checked")).toBe("true"),
		);
		expect(row(shadow, "cashonize").getAttribute("aria-checked")).toBe("false");
		await settle();
		expect(captionText(shadow)).toBe(BCHC_MESSAGES_EN.scanWith("Paytaca"));
		// Selecting the selected wallet again asks for nothing.
		await userEvent.click(row(shadow, "paytaca"));
		expect(order).toEqual(["wallet:paytaca"]);
		await settle();
	},
});

const REVERSED: readonly ProtocolOption[] = [...BCHC_PROTOCOLS].reverse();

// A wallet without the current session type: the wallet first, then the first
// session type it speaks in the configured order (here CashConnect first).
export const SelectWalletFallsBack = meta.story({
	args: { view: viewFor({ protocols: REVERSED, protocol: "cashconnect" }) },
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const order = recordSelection(modal);

		await userEvent.click(row(shadow, "paytaca"));
		expect(order).toEqual(["wallet:paytaca", "protocol:bch-wc2"]);
		await waitFor(() =>
			expect(
				shadow
					.querySelector('.tab[aria-selected="true"]')
					?.getAttribute("data-protocol"),
			).toBe("bch-wc2"),
		);
		expect(tabIds(shadow)).toEqual(["bch-wc2", "wizardconnect"]);
		await settle();
	},
});

// Manual activation in both groups: arrows only move focus, and Enter or Space
// selects, since a selection can switch protocol and restart the attempt.
export const KeyboardSelection = meta.story({
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const order = recordSelection(modal);

		row(shadow, "cashonize").focus();
		await userEvent.keyboard("{ArrowDown}");
		expect(shadow.activeElement).toBe(row(shadow, "paytaca"));
		expect(order).toEqual([]);
		await userEvent.keyboard("{End}");
		expect(shadow.activeElement).toBe(row(shadow, "optn"));
		expect(order).toEqual([]);
		await userEvent.keyboard(" ");
		expect(order).toEqual(["wallet:optn"]);
		await settle();

		const active = shadow.querySelector<HTMLElement>(
			'.tab[aria-selected="true"]',
		);
		if (active === null) throw new Error("active tab missing");
		active.focus();
		await userEvent.keyboard("{ArrowRight}");
		const next = shadow.activeElement;
		expect(next?.getAttribute("data-protocol")).toBe("bch-wc2");
		expect(order).toHaveLength(1);
		await userEvent.keyboard("{Enter}");
		expect(order).toEqual(["wallet:optn", "protocol:bch-wc2"]);
		await settle();
	},
});

// Cashonize's desktop link carries the live connection link; OPTN has none.
export const DesktopLink = meta.story({
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		const open = shadow.querySelector<HTMLAnchorElement>(".open.is-shown");
		if (open === null) throw new Error("Open action missing");
		expect(open.getAttribute("href")).toBe(
			`https://cashonize.com/?uri=${encodeURIComponent(PROTOCOL_LINKS.wizardconnect)}`,
		);
		expect(open.target).toBe("_blank");
		expect(open.rel).toBe("noreferrer");
		expect(open.getAttribute("aria-label")).toBe(
			BCHC_MESSAGES_EN.openWalletLabel("Cashonize"),
		);
		expect(open.textContent?.trim()).toBe(BCHC_MESSAGES_EN.open);
		expect(open.closest(".wallet-row")).toBe(
			row(shadow, "cashonize").parentElement,
		);
		expect(row(shadow, "optn").parentElement?.querySelector(".open")).toBe(
			null,
		);

		// Another wallet selected: Cashonize keeps its action hidden, with no live link.
		await userEvent.click(row(shadow, "optn"));
		await waitFor(() => expect(open).not.toHaveClass("is-shown"));
		expect(open.hasAttribute("href")).toBe(false);
		expect(open.getAttribute("aria-hidden")).toBe("true");
		expect(open.getAttribute("tabindex")).toBe("-1");
		await settle();
	},
});

// Until the relay hands over a link, the action is shown but can't be used.
export const DesktopLinkWaits = meta.story({
	args: {
		view: viewFor({
			protocol: "bch-wc2",
			phase: { kind: "initiating" },
		}),
	},
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		const open = shadow.querySelector<HTMLAnchorElement>(".open.is-shown");
		if (open === null) throw new Error("Open action missing");
		expect(open.hasAttribute("href")).toBe(false);
		expect(open.getAttribute("aria-disabled")).toBe("true");
	},
});

// `scanWith` decides where the name goes: the mark and name land in its place.
export const ScanWithNameFirst = meta.story({
	args: {
		messages: { scanWith: (wallet: string) => `${wallet} to scan` },
	},
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		const text = shadow.querySelector(".caption-text");
		expect(text?.firstElementChild).toHaveClass("caption-wallet");
		expect(text?.textContent?.trim()).toBe("Cashonize to scan");
	},
});

// A wording without the name still shows, as plain text.
export const ScanWithoutName = meta.story({
	args: { messages: { scanWith: () => "Scan to connect" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelector(".caption-wallet")).toBeNull();
		expect(captionText(shadow)).toBe("Scan to connect");
	},
});

// The drawer lists no wallets: its caption names none, and every session type is offered.
export const PhoneNamesNoWallet = meta.story({
	args: { view: viewFor({ wallet: "selene" }) },
	globals: { viewport: { value: "phone" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelector(".overlay")).toHaveClass("is-sheet");
		expect(shadow.querySelector(".caption-wallet")).toBeNull();
		expect(captionText(shadow)).toBe(BCHC_MESSAGES_EN.scan);
		expect(tabIds(shadow)).toEqual(["wizardconnect", "bch-wc2", "cashconnect"]);
	},
});

// A tab switch from the story harness: the tabs and the code follow, the rows stay put.
export const SwitchProtocol = meta.story({
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const onProtocol = fn<(event: Event) => void>();
		modal.addEventListener("bchc-protocol", onProtocol);
		const before = row(shadow, "cashonize");

		const tab = shadow.querySelector<HTMLElement>(
			'.tab[data-protocol="bch-wc2"]',
		);
		if (tab === null) throw new Error("WalletConnect tab missing");
		await userEvent.click(tab);
		expect(detailOf<{ protocol: string }>(onProtocol)).toEqual({
			protocol: "bch-wc2",
		});
		await waitFor(() => expect(tab.getAttribute("aria-selected")).toBe("true"));
		// Patched in place, not rebuilt: the same row node, still selected.
		expect(row(shadow, "cashonize")).toBe(before);
		expect(before.getAttribute("aria-checked")).toBe("true");
		await settle();
	},
});

// A tab switch while the default is selected pins that wallet first, so the
// selection doesn't jump to whichever wallet leads for the new protocol.
export const TabKeepsDefaultWallet = meta.story({
	args: {
		view: viewFor({
			protocol: "cashconnect",
			wallets: ["paytaca", "selene", "optn", "cashonize"].map(shipped),
		}),
	},
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const order = recordSelection(modal);
		const tab = shadow.querySelector<HTMLElement>(
			'.tab[data-protocol="bch-wc2"]',
		);
		if (tab === null) throw new Error("WalletConnect tab missing");
		await userEvent.click(tab);
		expect(order).toEqual(["wallet:optn", "protocol:bch-wc2"]);
		await waitFor(() => expect(tab.getAttribute("aria-selected")).toBe("true"));
		expect(row(shadow, "optn").getAttribute("aria-checked")).toBe("true");
		expect(row(shadow, "paytaca").getAttribute("aria-checked")).toBe("false");
		await settle();
	},
});

// A script URL as a desktop link, `{link}` or not, never becomes an Open action.
export const UnsafeDesktopLink = meta.story({
	args: {
		view: viewFor({
			wallets: [
				{ ...shipped("cashonize"), href: "javascript:alert(1)//{link}" },
				{ ...shipped("paytaca"), href: "javascript:alert(1)" },
			],
		}),
	},
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelector(".open")).toBeNull();
	},
});

// The radio group also follows the horizontal arrows, and Home goes back to the first.
export const KeyboardSelectionHorizontal = meta.story({
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const order = recordSelection(modal);
		row(shadow, "cashonize").focus();
		await userEvent.keyboard("{ArrowRight}");
		expect(shadow.activeElement).toBe(row(shadow, "paytaca"));
		await userEvent.keyboard("{Home}");
		expect(shadow.activeElement).toBe(row(shadow, "cashonize"));
		expect(order).toEqual([]);
		expect(shadow.querySelectorAll('[data-wallet][tabindex="0"]')).toHaveLength(
			1,
		);
		await settle();
	},
});

// Passing wallets without the current session type switches nothing: CashConnect
// stays until a wallet is chosen, and choosing OPTN keeps it.
export const KeyboardPassesWithoutSwitching = meta.story({
	args: { view: viewFor({ protocol: "cashconnect" }) },
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		const order = recordSelection(modal);
		row(shadow, "cashonize").focus();
		await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
		expect(shadow.activeElement).toBe(row(shadow, "optn"));
		expect(order).toEqual([]);
		await userEvent.keyboard("{Enter}");
		expect(order).toEqual(["wallet:optn"]);
		await waitFor(() =>
			expect(row(shadow, "optn").getAttribute("aria-checked")).toBe("true"),
		);
		expect(
			shadow
				.querySelector('.tab[aria-selected="true"]')
				?.getAttribute("data-protocol"),
		).toBe("cashconnect");
		await settle();
	},
});
