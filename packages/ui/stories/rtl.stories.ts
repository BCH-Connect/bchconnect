// RTL variants of the stories a direction bug would most likely reach:
// mirrored icons, inline-start/end layout, scroll regions and tabs. Each
// play asserts a fact that would fail if a physical `left`/`right` crept back in.

import { expect, userEvent, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { BCHC_PROTOCOLS } from "../src/defaults.ts";
import { BCHC_MESSAGES_EN, type BchcMessages } from "../src/messages.ts";
import {
	ARABIC_NAME,
	CJK_NAME,
	EMOJI_NAME,
	HEBREW_NAME,
	manyWallets,
	NULL_LOGO_WALLET,
	SCRIPT_WALLETS,
} from "./custom-wallets.ts";
import { viewFor } from "./fixtures.ts";
import {
	type ModalStoryArgs,
	modalHost,
	modalRender,
	modalShadow,
} from "./modal.ts";
import { settle } from "./settle.ts";
import { THEME_ARG_TYPES } from "./theme.ts";

const WIZARDCONNECT = BCHC_PROTOCOLS.find(
	(protocol) => protocol.id === "wizardconnect",
);
if (WIZARDCONNECT === undefined)
	throw new Error("wizardconnect missing from BCHC_PROTOCOLS");

const meta = preview.type<{ args: ModalStoryArgs }>().meta({
	component: "bchc-modal",
	argTypes: THEME_ARG_TYPES,
	args: { view: viewFor() },
	render: modalRender,
	play: async () => {
		await settle();
	},
});

// The wallet list (DOM-first) and the QR column (DOM-second) are `.split`'s
// two grid tracks; `direction: rtl` swaps which physical side each renders on.
export const ScanRtl = meta.story({
	globals: { direction: "rtl" },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const card = shadow.querySelector(".card");
		const list = shadow.querySelector(".cell-list");
		const tile = shadow.querySelector(".cell-tile");
		if (
			!(card instanceof HTMLElement) ||
			!(list instanceof HTMLElement) ||
			!(tile instanceof HTMLElement)
		)
			throw new Error("card, wallet list or code cell missing");
		expect(getComputedStyle(card).direction).toBe("rtl");
		expect(tile.getBoundingClientRect().left).toBeLessThan(
			list.getBoundingClientRect().left,
		);
		await settle();
	},
});

export const DeclinedRtl = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "rejected" } }) },
	globals: { direction: "rtl" },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const retry = shadow.querySelector<HTMLButtonElement>('[data-act="retry"]');
		const icon = retry?.querySelector("svg");
		if (retry === null || !(icon instanceof SVGElement))
			throw new Error("retry button or its icon missing");
		const box = retry.getBoundingClientRect();
		// The icon (DOM-first) trails the label in a mirrored row, landing right of center.
		expect(icon.getBoundingClientRect().left).toBeGreaterThan(
			box.left + box.width / 2,
		);
		await settle();
	},
});

export const WalletsRtl = meta.story({
	args: { view: viewFor({ screen: "wallets" }) },
	globals: { direction: "rtl" },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const back = shadow.querySelector<HTMLElement>('[aria-label="Back"]');
		const close = shadow.querySelector<HTMLElement>('[aria-label="Close"]');
		if (back === null || close === null)
			throw new Error("back or close button missing");
		// "Back" sits at the head's inline-start, now the card's right edge.
		expect(back.getBoundingClientRect().left).toBeGreaterThan(
			close.getBoundingClientRect().left,
		);
		const backIcon = back.querySelector("svg");
		if (backIcon === null) throw new Error("back icon missing");
		expect(getComputedStyle(backIcon).transform).toBe(
			"matrix(-1, 0, 0, 1, 0, 0)",
		);

		const row = shadow.querySelector(".directory-row");
		const logo = row?.querySelector(".directory-logo, .logo-fallback");
		const name = row?.querySelector(".wallet-name");
		if (!(logo instanceof HTMLElement) || !(name instanceof HTMLElement))
			throw new Error("directory row logo or name missing");
		expect(logo.getBoundingClientRect().left).toBeGreaterThan(
			name.getBoundingClientRect().left,
		);
		await settle();
	},
});

export const ManyWalletsRtl = meta.story({
	args: { view: viewFor({ wallets: manyWallets(40) }) },
	globals: { viewport: { value: "desktop" }, direction: "rtl" },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		const rows = shadow.querySelectorAll<HTMLButtonElement>(".wallet");
		expect(rows).toHaveLength(40);
		const wallets = shadow.querySelector(".wallets");
		const card = shadow.querySelector(".card");
		const tile = shadow.querySelector(".tile");
		if (
			!(wallets instanceof HTMLElement) ||
			!(card instanceof HTMLElement) ||
			!(tile instanceof HTMLElement)
		)
			throw new Error("wallets, card or tile missing");
		expect(wallets.scrollHeight).toBeGreaterThan(wallets.clientHeight);

		const last = rows[rows.length - 1];
		if (last === undefined) throw new Error("last wallet row missing");
		wallets.scrollTop = wallets.scrollHeight;
		last.focus();
		await waitFor(() => expect(shadow.activeElement).toBe(last));
		const cardBox = card.getBoundingClientRect();
		const tileBox = tile.getBoundingClientRect();
		expect(tileBox.top).toBeGreaterThanOrEqual(cardBox.top - 1);
		expect(tileBox.bottom).toBeLessThanOrEqual(cardBox.bottom + 1);

		const first = rows[0];
		if (first === undefined) throw new Error("first wallet row missing");
		const logo = first.querySelector("img, .logo-fallback");
		// The first row is the default selection, so its Open action shows.
		const open = first.parentElement?.querySelector(".open.is-shown");
		if (!(logo instanceof HTMLElement) || !(open instanceof HTMLElement))
			throw new Error("wallet logo or Open action missing");
		// The logo sits at the row's inline-start (the right edge here); the action trails it.
		expect(logo.getBoundingClientRect().left).toBeGreaterThan(
			open.getBoundingClientRect().left,
		);
		await settle();
	},
});

export const ScanPhoneRtl = meta.story({
	globals: { viewport: { value: "phone" }, direction: "rtl" },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		const card = shadow.querySelector(".card");
		if (!(card instanceof HTMLElement)) throw new Error("card missing");
		expect(shadow.querySelector(".overlay")).toHaveClass("is-sheet");
		expect(getComputedStyle(card).direction).toBe("rtl");

		const open = shadow.querySelector('a[data-act="open"]');
		if (!(open instanceof HTMLElement)) throw new Error("open link missing");
		const box = open.getBoundingClientRect();
		expect(box.bottom).toBeLessThanOrEqual(844);
		expect(box.top).toBeGreaterThanOrEqual(0);

		const grabber = shadow.querySelector(".grabber");
		if (!(grabber instanceof HTMLElement)) throw new Error("grabber missing");
		const grabberBox = grabber.getBoundingClientRect();
		const cardBox = card.getBoundingClientRect();
		// The drag handle has no reading direction: it stays centered either way.
		expect(grabberBox.left + grabberBox.width / 2).toBeCloseTo(
			cardBox.left + cardBox.width / 2,
			0,
		);
	},
});

export const WalletsPhoneRtl = meta.story({
	args: { view: viewFor({ screen: "wallets" }) },
	globals: { viewport: { value: "phone" }, direction: "rtl" },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelector(".overlay")).toHaveClass("is-sheet");
		const rows = shadow.querySelectorAll<HTMLElement>(".directory-row");
		expect(rows.length).toBeGreaterThan(0);
		const row = rows[0];
		if (row === undefined) throw new Error("directory row missing");
		const logo = row.querySelector(".directory-logo, .logo-fallback");
		const name = row.querySelector(".wallet-name");
		if (!(logo instanceof HTMLElement) || !(name instanceof HTMLElement))
			throw new Error("directory logo or name missing");
		expect(logo.getBoundingClientRect().left).toBeGreaterThan(
			name.getBoundingClientRect().left,
		);
	},
});

export const SingleProtocolRtl = meta.story({
	args: { view: viewFor({ protocols: [WIZARDCONNECT] }) },
	globals: { direction: "rtl" },
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelector('[role="tablist"]')).toBeNull();
		expect(shadow.querySelector(".session.is-info")).not.toBeNull();

		// Gaining protocols turns the label into tabs, which run from the right edge.
		modal.view = viewFor();
		const tabs = await waitFor(() => {
			const found = shadow.querySelectorAll<HTMLButtonElement>(".tab");
			if (found.length !== 3) throw new Error("tabs missing");
			return [...found];
		});
		const [first, second] = tabs;
		if (first === undefined || second === undefined)
			throw new Error("tabs missing");
		await settle();
		expect(first.getBoundingClientRect().left).toBeGreaterThan(
			second.getBoundingClientRect().left,
		);
		// The arrow pointing along reading order moves focus forward.
		first.focus();
		await userEvent.keyboard("{ArrowLeft}");
		expect(shadow.activeElement).toBe(second);
		await settle();
	},
});

export const NullLogoRtl = meta.story({
	args: { view: viewFor({ wallets: [NULL_LOGO_WALLET, ...manyWallets(1)] }) },
	globals: { direction: "rtl" },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLElement>('[data-wallet="null-logo"]');
		if (row === null) throw new Error("null-logo row missing");
		const fallback = row.querySelector(".logo-fallback");
		const name = row.querySelector(".wallet-name");
		if (!(fallback instanceof HTMLElement) || !(name instanceof HTMLElement))
			throw new Error("fallback tile or wallet name missing");
		expect(row.querySelector("img")).toBeNull();
		expect(fallback.getBoundingClientRect().left).toBeGreaterThan(
			name.getBoundingClientRect().left,
		);
		await settle();
	},
});

// The Arabic/Hebrew names already in `custom-wallets.ts`, rendered once under
// `direction: rtl` so the modal's own bidi runs (CJK, emoji) sit alongside them.
export const InternationalWalletNamesRtl = meta.story({
	args: { view: viewFor({ wallets: SCRIPT_WALLETS }) },
	globals: { direction: "rtl" },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const names = [...shadow.querySelectorAll<HTMLElement>(".wallet-name")].map(
			(el) => el.textContent,
		);
		expect(names).toEqual([CJK_NAME, EMOJI_NAME, ARABIC_NAME, HEBREW_NAME]);
		await settle();
	},
});

// Fixture copy, not a real translation: a handful of keys stand in for an
// Arabic locale so `dir="rtl"` and a non-English `messages.lang` are proven
// together, the combination a built-in locale alone wouldn't cover (both
// built-in locales ship LTR today).
const FIXTURE_MESSAGES_AR: BchcMessages = {
	...BCHC_MESSAGES_EN,
	lang: "ar",
	connectTitle: ARABIC_NAME,
};

export const ScanRtlTranslated = meta.story({
	args: { messages: FIXTURE_MESSAGES_AR },
	globals: { direction: "rtl" },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const overlay = shadow.querySelector(".overlay");
		if (overlay === null) throw new Error("overlay missing");
		expect(overlay.getAttribute("lang")).toBe("ar");
		expect(getComputedStyle(overlay).direction).toBe("rtl");
		const title = shadow.querySelector(".title");
		expect(title?.textContent).toBe(ARABIC_NAME);
		await settle();
	},
});
