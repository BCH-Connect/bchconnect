// What a consumer can actually hand the modal: huge lists, unusual scripts,
// markup-shaped names, broken logos, and the empty/singular edges of its own
// public types (`ModalView`, `WalletOption`, `WalletDirectoryEntry`,
// `ProtocolOption`).

import { expect, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { BCHC_PROTOCOLS } from "../src/defaults.ts";
import { BCHC_MESSAGES_EN } from "../src/messages.ts";
import {
	BROKEN_LOGO_WALLET,
	CJK_NAME,
	EMOJI_NAME,
	HREF_EMPTY_DIRECTORY_ENTRY,
	HREF_NULL_WALLET,
	HTML_LIKE_DIRECTORY_ENTRY,
	HTML_LIKE_NAME,
	HTML_LIKE_WALLET,
	LABELED_DIRECTORY_ENTRY,
	LONG_LINK_LABEL_DIRECTORY_ENTRY,
	LONG_NAME,
	LONG_NAME_DIRECTORY_ENTRY,
	LONG_NAME_WALLET,
	manyDirectory,
	manyWallets,
	NO_LABEL_DIRECTORY_ENTRY,
	NO_LINK_DIRECTORY_ENTRY,
	NULL_LOGO_DIRECTORY_ENTRY,
	NULL_LOGO_WALLET,
	SCRIPT_DIRECTORY,
	SCRIPT_WALLETS,
	SVG_LOGO_WALLET,
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

// The wallet list scrolls on its own: scrolling it to its end never moves the
// QR tile, which stays fully inside the card.
export const ManyWallets = meta.story({
	args: { view: viewFor({ wallets: manyWallets(40) }) },
	globals: { viewport: { value: "desktop" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
		const rows = shadow.querySelectorAll<HTMLButtonElement>(".wallet");
		expect(rows).toHaveLength(40);
		const last = rows[rows.length - 1];
		if (last === undefined) throw new Error("last wallet row missing");
		expect(last.textContent).toContain("Wallet 40");

		const wallets = shadow.querySelector(".wallets");
		const card = shadow.querySelector(".card");
		const tile = shadow.querySelector(".tile");
		const body = shadow.querySelector(".body");
		if (
			!(wallets instanceof HTMLElement) ||
			!(card instanceof HTMLElement) ||
			!(tile instanceof HTMLElement) ||
			!(body instanceof HTMLElement)
		)
			throw new Error("wallets, card, tile or body missing");
		expect(wallets.scrollHeight).toBeGreaterThan(wallets.clientHeight);

		wallets.scrollTop = wallets.scrollHeight;
		last.focus();
		await waitFor(() => expect(shadow.activeElement).toBe(last));

		const cardBox = card.getBoundingClientRect();
		const tileBox = tile.getBoundingClientRect();
		expect(tileBox.top).toBeGreaterThanOrEqual(cardBox.top - 1);
		expect(tileBox.bottom).toBeLessThanOrEqual(cardBox.bottom + 1);
		expect(body.scrollTop).toBe(0);
		await settle();
	},
});

// A second viewport, not a resize of the first: proves the same pure-CSS
// layout holds at a different available height, with no script measuring it.
export const ManyWalletsShortDesktop = meta.story({
	args: { view: viewFor({ wallets: manyWallets(40) }) },
	globals: { viewport: { value: "desktopShort" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = modalShadow(canvasElement);
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

		const cardBox = card.getBoundingClientRect();
		const tileBox = tile.getBoundingClientRect();
		expect(tileBox.top).toBeGreaterThanOrEqual(cardBox.top - 1);
		expect(tileBox.bottom).toBeLessThanOrEqual(cardBox.bottom + 1);
		await settle();
	},
});

// The directory list scrolls on its own (capped by the Connect-height rule
// below), not `.body`.
export const ManyDirectory = meta.story({
	args: { view: viewFor({ screen: "wallets", directory: manyDirectory(40) }) },
	globals: { viewport: { value: "desktop" } },
	play: async ({ canvasElement }) => {
		// The entrance plays `.overlay.is-entering .body { overflow: clip }`
		// so incoming rows don't scroll before they settle; wait it out first.
		await settle();
		const shadow = modalShadow(canvasElement);
		const rows = shadow.querySelectorAll<HTMLAnchorElement>(".directory-row");
		expect(rows).toHaveLength(40);
		const directory = shadow.querySelector(".directory");
		if (!(directory instanceof HTMLElement))
			throw new Error("directory missing");
		expect(directory.scrollHeight).toBeGreaterThan(directory.clientHeight);
		const last = rows[rows.length - 1];
		if (last === undefined) throw new Error("last directory row missing");
		// Scroll the list directly: focus's implicit scroll-into-view isn't
		// reliable for an off-screen row inside a shadow root.
		directory.scrollTop = directory.scrollHeight;
		last.focus();
		// `toHaveFocus` reads `document.activeElement`, which stops at the host
		// across a shadow boundary; the shadow root's own `activeElement` is the
		// one that actually tracks focus inside it.
		await waitFor(() => expect(shadow.activeElement).toBe(last));
		const directoryBox = directory.getBoundingClientRect();
		const lastBox = last.getBoundingClientRect();
		expect(lastBox.top).toBeGreaterThanOrEqual(directoryBox.top - 1);
		expect(lastBox.bottom).toBeLessThanOrEqual(directoryBox.bottom + 1);
		await settle();
	},
});

// Switches the same element to Connect to derive its height, then back to
// confirm "Get a wallet" never grows past it and its label stays pinned
// while the list scrolls.
async function expectWalletsCappedToConnect(
	canvasElement: HTMLElement,
	view: ModalStoryArgs["view"],
): Promise<void> {
	const modal = modalHost(canvasElement);
	const shadow = modalShadow(canvasElement);
	const card = shadow.querySelector(".card");
	if (!(card instanceof HTMLElement)) throw new Error("card missing");

	modal.view = { ...view, screen: "connect" };
	await settle();
	const connectHeight = card.getBoundingClientRect().height;

	modal.view = view;
	await settle();

	const sectionLabel = shadow.querySelector(".section-label");
	const directory = shadow.querySelector(".directory");
	if (
		!(sectionLabel instanceof HTMLElement) ||
		!(directory instanceof HTMLElement)
	)
		throw new Error("section label or directory missing");

	expect(card.getBoundingClientRect().height).toBeLessThanOrEqual(
		connectHeight + 1,
	);
	expect(directory.scrollHeight).toBeGreaterThan(directory.clientHeight);

	const rows = shadow.querySelectorAll<HTMLAnchorElement>(".directory-row");
	const last = rows[rows.length - 1];
	if (last === undefined) throw new Error("last directory row missing");
	directory.scrollTop = directory.scrollHeight;
	last.focus();
	await waitFor(() => expect(shadow.activeElement).toBe(last));

	const labelBox = sectionLabel.getBoundingClientRect();
	const cardBox = card.getBoundingClientRect();
	expect(labelBox.top).toBeGreaterThanOrEqual(cardBox.top);
	expect(labelBox.bottom).toBeLessThanOrEqual(cardBox.bottom);
}

export const ManyDirectoryWide = meta.story({
	args: { view: viewFor({ screen: "wallets", directory: manyDirectory(40) }) },
	globals: { viewport: { value: "desktop" } },
	play: async ({ canvasElement, args }) => {
		await settle();
		await expectWalletsCappedToConnect(canvasElement, args.view);
		await settle();
	},
});

export const ManyDirectoryWideShort = meta.story({
	args: { view: viewFor({ screen: "wallets", directory: manyDirectory(40) }) },
	globals: { viewport: { value: "desktopShort" } },
	play: async ({ canvasElement, args }) => {
		await settle();
		await expectWalletsCappedToConnect(canvasElement, args.view);
		await settle();
	},
});

// A long name ellipsizes on one line, keeps the full name reachable via
// `title`, and never grows the row past a short-name row's height.
export const LongWalletName = meta.story({
	args: { view: viewFor({ wallets: [LONG_NAME_WALLET, ...manyWallets(1)] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLElement>('[data-wallet="long-name"]');
		const name = row?.querySelector<HTMLElement>(".wallet-name");
		const shortRow = shadow.querySelector<HTMLElement>(
			'[data-wallet="wallet-0"]',
		);
		if (row === null || name == null || shortRow === null)
			throw new Error("long wallet name or short reference row missing");
		expect(name.textContent).toBe(LONG_NAME);
		expect(name.getAttribute("title")).toBe(LONG_NAME);
		expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
		// Sub-pixel text layout can differ a fraction of a pixel between engines.
		expect(row.getBoundingClientRect().height).toBeCloseTo(
			shortRow.getBoundingClientRect().height,
			0,
		);
		await settle();
	},
});

export const LongDirectoryName = meta.story({
	args: {
		view: viewFor({
			screen: "wallets",
			directory: [LONG_NAME_DIRECTORY_ENTRY, ...manyDirectory(1)],
		}),
	},
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const rows = shadow.querySelectorAll<HTMLElement>(".directory-row");
		const row = rows[0];
		const shortRow = rows[1];
		const name = row?.querySelector<HTMLElement>(".wallet-name");
		if (row === undefined || shortRow === undefined || name == null)
			throw new Error("long directory name or short reference row missing");
		expect(name.textContent).toBe(LONG_NAME);
		expect(name.getAttribute("title")).toBe(LONG_NAME);
		expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
		// Sub-pixel text layout can differ a fraction of a pixel between engines.
		expect(row.getBoundingClientRect().height).toBeCloseTo(
			shortRow.getBoundingClientRect().height,
			0,
		);
		await settle();
	},
});

export const LongDirectoryLinkLabel = meta.story({
	args: {
		view: viewFor({
			screen: "wallets",
			directory: [LONG_LINK_LABEL_DIRECTORY_ENTRY],
		}),
	},
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const button = shadow.querySelector<HTMLElement>(
			".directory-links .button",
		);
		if (button === null) throw new Error("directory link button missing");
		expect(button.textContent).toContain(
			LONG_LINK_LABEL_DIRECTORY_ENTRY.link?.label,
		);
		await settle();
	},
});

// A directory entry with no `label` falls back to `getWallet(name)`; one
// carrying its own `label` shows that instead.
export const DirectoryLinkFallback = meta.story({
	args: {
		view: viewFor({
			screen: "wallets",
			directory: [NO_LABEL_DIRECTORY_ENTRY, LABELED_DIRECTORY_ENTRY],
		}),
	},
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const rows = shadow.querySelectorAll<HTMLElement>(".directory-row");
		const fallback = rows[0]?.querySelector(".directory-links .button");
		const labeled = rows[1]?.querySelector(".directory-links .button");
		if (fallback === null || fallback === undefined || labeled == null)
			throw new Error("directory link button missing");
		expect(fallback.textContent).toContain(
			BCHC_MESSAGES_EN.getWallet(NO_LABEL_DIRECTORY_ENTRY.name),
		);
		expect(labeled.textContent).toContain(LABELED_DIRECTORY_ENTRY.link?.label);
		await settle();
	},
});

// `link: null` renders the row with no "Get it" pill at all.
export const NoLinkDirectoryEntry = meta.story({
	args: {
		view: viewFor({
			screen: "wallets",
			directory: [NO_LINK_DIRECTORY_ENTRY],
		}),
	},
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector(".directory-row");
		if (row === null) throw new Error("directory row missing");
		expect(row.querySelector(".directory-links")).toBeNull();
		expect(row.tagName).toBe("DIV");
		expect(getComputedStyle(row).cursor).not.toBe("pointer");
		await settle();
	},
});

export const InternationalWalletNames = meta.story({
	args: { view: viewFor({ wallets: SCRIPT_WALLETS }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const names = [...shadow.querySelectorAll<HTMLElement>(".wallet-name")].map(
			(el) => el.textContent,
		);
		expect(names).toEqual([
			CJK_NAME,
			EMOJI_NAME,
			expect.any(String),
			expect.any(String),
		]);
		await settle();
	},
});

export const InternationalDirectoryNames = meta.story({
	args: { view: viewFor({ screen: "wallets", directory: SCRIPT_DIRECTORY }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const names = [...shadow.querySelectorAll<HTMLElement>(".wallet-name")].map(
			(el) => el.textContent,
		);
		expect(names).toHaveLength(SCRIPT_DIRECTORY.length);
		expect(names[0]).toBe(CJK_NAME);
		await settle();
	},
});

// `escapeHtml` must turn this into literal text: no injected element, no
// executed handler.
export const HtmlLikeWalletName = meta.story({
	args: { view: viewFor({ wallets: [HTML_LIKE_WALLET] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const name = shadow.querySelector<HTMLElement>(
			'[data-wallet="html-like"] .wallet-name',
		);
		if (name === null) throw new Error("html-like wallet name missing");
		expect(name.textContent).toBe(HTML_LIKE_NAME);
		expect(name.children).toHaveLength(0);
		expect(name.querySelector("img")).toBeNull();
		await settle();
	},
});

export const HtmlLikeDirectoryLinkLabel = meta.story({
	args: {
		view: viewFor({
			screen: "wallets",
			directory: [HTML_LIKE_DIRECTORY_ENTRY],
		}),
	},
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const button = shadow.querySelector<HTMLElement>(
			".directory-links .button",
		);
		if (button === null) throw new Error("directory link button missing");
		expect(button.textContent).toContain(HTML_LIKE_NAME);
		expect(button.querySelector("img")).toBeNull();
		await settle();
	},
});

// A load failure swaps the broken `<img>` for the same generic tile a `null`
// logo renders, in the same footprint as a working logo in the sibling row.
export const BrokenLogo = meta.story({
	args: {
		view: viewFor({ wallets: [BROKEN_LOGO_WALLET, ...manyWallets(1)] }),
	},
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLElement>(
			'[data-wallet="broken-logo"]',
		);
		if (row === null) throw new Error("broken-logo row missing");
		const fallback = await waitFor(() => {
			const found = row.querySelector(".logo-fallback");
			if (found === null) throw new Error("fallback tile missing");
			return found;
		});
		expect(row.querySelector("img")).toBeNull();
		expect(fallback.getAttribute("aria-hidden")).toBe("true");
		const sibling = shadow.querySelector('[data-wallet="wallet-0"] img');
		if (!(sibling instanceof HTMLElement))
			throw new Error("sibling logo missing");
		const fallbackBox = fallback.getBoundingClientRect();
		const siblingBox = sibling.getBoundingClientRect();
		expect(fallbackBox.width).toBeCloseTo(siblingBox.width, 0);
		expect(fallbackBox.height).toBeCloseTo(siblingBox.height, 0);
		// The row stays a normal, selectable entry with its desktop link despite the failed image.
		expect(row.getAttribute("aria-checked")).toBe("true");
		expect(
			row.parentElement?.querySelector(".open")?.getAttribute("href"),
		).toBe(BROKEN_LOGO_WALLET.href);
		// The caption names it with the same fallback tile.
		expect(
			shadow.querySelector(".caption-wallet .logo-fallback"),
		).not.toBeNull();
		expect(row.querySelector(".wallet-name")?.textContent).toBe(
			BROKEN_LOGO_WALLET.name,
		);
		await settle();
	},
});

// `logo: null` renders the generic wallet tile directly, no `<img>` and no
// load to fail, in the same footprint as a real logo in the sibling row.
export const NullLogo = meta.story({
	args: { view: viewFor({ wallets: [NULL_LOGO_WALLET, ...manyWallets(1)] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLElement>('[data-wallet="null-logo"]');
		const sibling = shadow.querySelector<HTMLElement>(
			'[data-wallet="wallet-0"]',
		);
		if (row === null || sibling === null)
			throw new Error("null-logo or sibling row missing");
		const fallback = row.querySelector(".logo-fallback");
		const siblingImg = sibling.querySelector("img");
		if (
			!(fallback instanceof HTMLElement) ||
			!(siblingImg instanceof HTMLElement)
		)
			throw new Error("fallback tile or sibling logo missing");
		expect(row.querySelector("img")).toBeNull();
		expect(fallback.getAttribute("aria-hidden")).toBe("true");
		// The canvas can render at a non-1:1 scale, so the tile's box is
		// compared against the sibling's real 32px logo rather than a literal number.
		const fallbackBox = fallback.getBoundingClientRect();
		const siblingBox = siblingImg.getBoundingClientRect();
		expect(fallbackBox.width).toBeCloseTo(siblingBox.width, 0);
		expect(fallbackBox.height).toBeCloseTo(siblingBox.height, 0);
		expect(row.getBoundingClientRect().height).toBeCloseTo(
			sibling.getBoundingClientRect().height,
			0,
		);
		await settle();
	},
});

export const NullDirectoryLogo = meta.story({
	args: {
		view: viewFor({
			screen: "wallets",
			directory: [NULL_LOGO_DIRECTORY_ENTRY, ...manyDirectory(1)],
		}),
	},
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const rows = shadow.querySelectorAll<HTMLElement>(".directory-row");
		const row = rows[0];
		const sibling = rows[1];
		if (row === undefined || sibling === undefined)
			throw new Error("directory rows missing");
		const fallback = row.querySelector(".logo-fallback");
		const siblingImg = sibling.querySelector("img");
		if (
			!(fallback instanceof HTMLElement) ||
			!(siblingImg instanceof HTMLElement)
		)
			throw new Error("fallback tile or sibling logo missing");
		expect(row.querySelector("img")).toBeNull();
		expect(fallback.getAttribute("aria-hidden")).toBe("true");
		// The canvas can render at a non-1:1 scale, so the tile's box is
		// compared against the sibling's real 36px logo rather than a literal number.
		const fallbackBox = fallback.getBoundingClientRect();
		const siblingBox = siblingImg.getBoundingClientRect();
		expect(fallbackBox.width).toBeCloseTo(siblingBox.width, 0);
		expect(fallbackBox.height).toBeCloseTo(siblingBox.height, 0);
		expect(row.getBoundingClientRect().height).toBeCloseTo(
			sibling.getBoundingClientRect().height,
			0,
		);
		await settle();
	},
});

export const SvgLogo = meta.story({
	args: { view: viewFor({ wallets: [SVG_LOGO_WALLET] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const img = shadow.querySelector<HTMLImageElement>(
			'[data-wallet="svg-logo"] img',
		);
		if (img === null) throw new Error("logo img missing");
		await waitFor(() => expect(img.naturalWidth).toBeGreaterThan(0));
		await settle();
	},
});

export const HrefNullWallet = meta.story({
	args: { view: viewFor({ wallets: [HREF_NULL_WALLET] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLElement>('[data-wallet="no-link"]');
		if (row === null) throw new Error("wallet row missing");
		// Still selectable, and selected as the only wallet; it just has nothing to open.
		expect(row.getAttribute("aria-checked")).toBe("true");
		expect(row.parentElement?.querySelector(".open")).toBeNull();
		await settle();
	},
});

// An empty href is just as unusable as `link: null`: no pill, no href.
export const HrefEmptyDirectoryEntry = meta.story({
	args: {
		view: viewFor({
			screen: "wallets",
			directory: [HREF_EMPTY_DIRECTORY_ENTRY],
		}),
	},
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLElement>(".directory-row");
		if (row === null) throw new Error("directory row missing");
		expect(row.tagName).toBe("DIV");
		expect(row.querySelector(".directory-links")).toBeNull();
		await settle();
	},
});

export const ZeroWallets = meta.story({
	args: { view: viewFor({ wallets: [] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelectorAll(".wallet")).toHaveLength(0);
		expect(shadow.querySelector('[data-act="wallets"]')).not.toBeNull();
		await settle();
	},
});

export const SingleWallet = meta.story({
	args: { view: viewFor({ wallets: manyWallets(1) }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelectorAll(".wallet")).toHaveLength(1);
		await settle();
	},
});

export const EmptyDirectory = meta.story({
	args: { view: viewFor({ screen: "wallets", directory: [] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelectorAll(".directory-row")).toHaveLength(0);
		await settle();
	},
});

// A single session type has nothing to choose, so it shows as an informational
// label in the tabs' place: no tablist, nothing focusable, and the tile is no tabpanel.
export const SingleProtocol = meta.story({
	args: {
		view: viewFor({ protocols: [WIZARDCONNECT] }),
	},
	play: async ({ canvasElement }) => {
		await settle();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelector('[role="tablist"]')).toBeNull();
		expect(shadow.querySelector(".tile")?.getAttribute("role")).toBeNull();
		const info = shadow.querySelector(".session.is-info");
		if (info === null) throw new Error("single-protocol label missing");
		expect(info.querySelector(".label")?.textContent).toBe(
			BCHC_MESSAGES_EN.sessionType,
		);
		const value = info.querySelector(".session-value");
		expect(value?.textContent).toBe(WIZARDCONNECT.name);
		expect(value?.querySelector("img.tab-mark")).not.toBeNull();
		expect(info.querySelector("button, [tabindex]")).toBeNull();

		// Gaining protocols turns the label into tabs, the active one selected.
		modal.view = viewFor();
		const tabs = await waitFor(() => {
			const found = shadow.querySelectorAll(".tab");
			if (found.length !== 3) throw new Error("tabs missing");
			return found;
		});
		expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
		expect(shadow.querySelector(".session.is-info")).toBeNull();
		await settle();
	},
});

const PROTOCOL_WITHOUT_MARK = BCHC_PROTOCOLS.map((protocol, index) =>
	index === 0 ? { ...protocol, mark: null } : protocol,
);

export const ProtocolMarkNull = meta.story({
	args: { view: viewFor({ protocols: PROTOCOL_WITHOUT_MARK }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		// The markless tab is inactive, where a dense tab shows only its mark: it keeps its name.
		modalHost(canvasElement).view = viewFor({
			protocols: PROTOCOL_WITHOUT_MARK,
			protocol: "walletconnect",
		});
		const tab = await waitFor(() => {
			const found = shadow.querySelector<HTMLElement>(
				`.tab[data-protocol="${PROTOCOL_WITHOUT_MARK[0]?.id}"]`,
			);
			if (found?.getAttribute("aria-selected") !== "false")
				throw new Error("markless tab missing");
			return found;
		});
		await settle();
		expect(tab.querySelector("img")).toBeNull();
		const name = tab.querySelector(".tab-name-inner");
		if (!(name instanceof HTMLElement)) throw new Error("tab name missing");
		expect(name.getBoundingClientRect().width).toBeGreaterThan(20);
		expect(getComputedStyle(name).opacity).toBe("1");
	},
});
