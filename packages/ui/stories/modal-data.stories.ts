// What a consumer can actually hand the modal: huge lists, unusual scripts,
// markup-shaped names, broken logos, and the empty/singular edges of its own
// public types (`ModalView`, `WalletOption`, `WalletDirectoryEntry`,
// `ProtocolOption`).

import { waitForAnimations } from "storybook/preview-api";
import { expect, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { BCHC_PROTOCOLS } from "../src/defaults.ts";
import {
	BROKEN_LOGO_WALLET,
	CJK_NAME,
	EMOJI_NAME,
	HREF_EMPTY_DIRECTORY_ENTRY,
	HREF_NULL_WALLET,
	HTML_LIKE_DIRECTORY_ENTRY,
	HTML_LIKE_NAME,
	HTML_LIKE_WALLET,
	LONG_LINK_LABEL_DIRECTORY_ENTRY,
	LONG_NAME,
	LONG_NAME_DIRECTORY_ENTRY,
	LONG_NAME_WALLET,
	manyDirectory,
	manyWallets,
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
		await waitForAnimations();
	},
});

// The wallet list scrolls on its own: scrolling it to its end never moves the
// QR tile, which stays fully inside the card.
export const ManyWallets = meta.story({
	args: { view: viewFor({ wallets: manyWallets(40) }) },
	globals: { viewport: { value: "desktop" } },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const shadow = modalShadow(canvasElement);
		const rows = shadow.querySelectorAll<HTMLAnchorElement>(".wallet");
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
		await waitForAnimations();
	},
});

// A second viewport, not a resize of the first: proves the same pure-CSS
// layout holds at a different available height, with no script measuring it.
export const ManyWalletsShortDesktop = meta.story({
	args: { view: viewFor({ wallets: manyWallets(40) }) },
	globals: { viewport: { value: "desktopShort" } },
	play: async ({ canvasElement }) => {
		await waitForAnimations();
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
		await waitForAnimations();
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
		await waitForAnimations();
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
		await waitForAnimations();
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
	await waitForAnimations();
	const connectHeight = card.getBoundingClientRect().height;

	modal.view = view;
	await waitForAnimations();

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
		await waitForAnimations();
		await expectWalletsCappedToConnect(canvasElement, args.view);
		await waitForAnimations();
	},
});

export const ManyDirectoryWideShort = meta.story({
	args: { view: viewFor({ screen: "wallets", directory: manyDirectory(40) }) },
	globals: { viewport: { value: "desktopShort" } },
	play: async ({ canvasElement, args }) => {
		await waitForAnimations();
		await expectWalletsCappedToConnect(canvasElement, args.view);
		await waitForAnimations();
	},
});

// A long name ellipsizes on one line, keeps the full name reachable via
// `title`, and never grows the row past a short-name row's height.
export const LongWalletName = meta.story({
	args: { view: viewFor({ wallets: [LONG_NAME_WALLET, ...manyWallets(1)] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLElement>('[data-id="long-name"]');
		const name = row?.querySelector<HTMLElement>(".wallet-name");
		const shortRow = shadow.querySelector<HTMLElement>('[data-id="wallet-0"]');
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
		await waitForAnimations();
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
		await waitForAnimations();
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
		await waitForAnimations();
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
		await waitForAnimations();
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
		await waitForAnimations();
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
		await waitForAnimations();
	},
});

// `escapeHtml` must turn this into literal text: no injected element, no
// executed handler.
export const HtmlLikeWalletName = meta.story({
	args: { view: viewFor({ wallets: [HTML_LIKE_WALLET] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const name = shadow.querySelector<HTMLElement>(
			'[data-id="html-like"] .wallet-name',
		);
		if (name === null) throw new Error("html-like wallet name missing");
		expect(name.textContent).toBe(HTML_LIKE_NAME);
		expect(name.children).toHaveLength(0);
		expect(name.querySelector("img")).toBeNull();
		await waitForAnimations();
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
		await waitForAnimations();
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
		const row = shadow.querySelector<HTMLAnchorElement>(
			'[data-id="broken-logo"]',
		);
		if (row === null) throw new Error("broken-logo row missing");
		const fallback = await waitFor(() => {
			const found = row.querySelector(".logo-fallback");
			if (found === null) throw new Error("fallback tile missing");
			return found;
		});
		expect(row.querySelector("img")).toBeNull();
		expect(fallback.getAttribute("aria-hidden")).toBe("true");
		const sibling = shadow.querySelector('[data-id="wallet-0"] img');
		if (!(sibling instanceof HTMLElement))
			throw new Error("sibling logo missing");
		const fallbackBox = fallback.getBoundingClientRect();
		const siblingBox = sibling.getBoundingClientRect();
		expect(fallbackBox.width).toBeCloseTo(siblingBox.width, 0);
		expect(fallbackBox.height).toBeCloseTo(siblingBox.height, 0);
		// The row stays a normal, navigable entry despite the failed image.
		expect(row.getAttribute("href")).toBe(BROKEN_LOGO_WALLET.href);
		expect(row.querySelector(".wallet-name")?.textContent).toBe(
			BROKEN_LOGO_WALLET.name,
		);
		await waitForAnimations();
	},
});

// `logo: null` renders the generic wallet tile directly, no `<img>` and no
// load to fail, in the same footprint as a real logo in the sibling row.
export const NullLogo = meta.story({
	args: { view: viewFor({ wallets: [NULL_LOGO_WALLET, ...manyWallets(1)] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLAnchorElement>(
			'[data-id="null-logo"]',
		);
		const sibling = shadow.querySelector<HTMLAnchorElement>(
			'[data-id="wallet-0"]',
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
		await waitForAnimations();
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
		await waitForAnimations();
	},
});

export const SvgLogo = meta.story({
	args: { view: viewFor({ wallets: [SVG_LOGO_WALLET] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const img = shadow.querySelector<HTMLImageElement>(
			'[data-id="svg-logo"] img',
		);
		if (img === null) throw new Error("logo img missing");
		await waitFor(() => expect(img.naturalWidth).toBeGreaterThan(0));
		await waitForAnimations();
	},
});

export const HrefNullWallet = meta.story({
	args: { view: viewFor({ wallets: [HREF_NULL_WALLET] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const row = shadow.querySelector<HTMLAnchorElement>('[data-id="no-link"]');
		if (row === null) throw new Error("disabled wallet row missing");
		expect(row.hasAttribute("href")).toBe(false);
		expect(row.getAttribute("aria-disabled")).toBe("true");
		await waitForAnimations();
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
		await waitForAnimations();
	},
});

export const ZeroWallets = meta.story({
	args: { view: viewFor({ wallets: [] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelectorAll(".wallet")).toHaveLength(0);
		expect(shadow.querySelector('[data-act="wallets"]')).not.toBeNull();
		await waitForAnimations();
	},
});

export const SingleWallet = meta.story({
	args: { view: viewFor({ wallets: manyWallets(1) }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelectorAll(".wallet")).toHaveLength(1);
		await waitForAnimations();
	},
});

export const EmptyDirectory = meta.story({
	args: { view: viewFor({ screen: "wallets", directory: [] }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelectorAll(".directory-row")).toHaveLength(0);
		await waitForAnimations();
	},
});

// A single session type has nothing to choose, so it shows as the same pill
// the dropdown trigger uses, with no chevron and no interactive state.
export const SingleProtocol = meta.story({
	args: {
		view: viewFor({ protocols: [WIZARDCONNECT] }),
	},
	play: async ({ canvasElement }) => {
		await waitForAnimations();
		const modal = modalHost(canvasElement);
		const shadow = modalShadow(canvasElement);
		expect(shadow.querySelector("button.select")).toBeNull();
		expect(shadow.querySelector('[aria-haspopup="listbox"]')).toBeNull();
		expect(shadow.querySelector('[role="listbox"]')).toBeNull();
		const label = shadow.querySelector(".select");
		if (label === null) throw new Error("single-protocol label missing");
		expect(label.tagName).toBe("SPAN");
		expect(label.textContent).toBe(WIZARDCONNECT.name);
		expect(label.querySelector("svg")).toBeNull();
		expect(label.getAttribute("tabindex")).toBeNull();
		(label as HTMLElement).focus();
		expect(shadow.activeElement).not.toBe(label);

		const staticHeight = label.getBoundingClientRect().height;
		const staticComputed = getComputedStyle(label);
		const staticBackground = staticComputed.backgroundColor;
		const staticColor = staticComputed.color;
		const staticRadius = staticComputed.borderRadius;

		// Gaining a second protocol turns the same element's label into the dropdown it mirrors.
		modal.view = viewFor();
		const trigger = await waitFor(() => {
			const found = shadow.querySelector("button.select");
			if (found === null) throw new Error("dropdown trigger missing");
			return found;
		});
		const triggerComputed = getComputedStyle(trigger);
		expect(staticHeight).toBeCloseTo(trigger.getBoundingClientRect().height, 0);
		expect(staticBackground).toBe(triggerComputed.backgroundColor);
		expect(staticColor).toBe(triggerComputed.color);
		expect(staticRadius).toBe(triggerComputed.borderRadius);
		await waitForAnimations();
	},
});

const PROTOCOL_WITHOUT_MARK = BCHC_PROTOCOLS.map((protocol, index) =>
	index === 0 ? { ...protocol, mark: null } : protocol,
);

export const ProtocolMarkNull = meta.story({
	args: { view: viewFor({ protocols: PROTOCOL_WITHOUT_MARK }) },
	play: async ({ canvasElement }) => {
		const shadow = modalShadow(canvasElement);
		const option = shadow.querySelector(
			`[role="option"][data-protocol="${PROTOCOL_WITHOUT_MARK[0]?.id}"]`,
		);
		const mark = option?.querySelector(".option-mark");
		if (!(mark instanceof HTMLElement)) throw new Error("option mark missing");
		expect(mark.tagName).toBe("SPAN");
		expect(mark.querySelector("img")).toBeNull();
		await waitForAnimations();
	},
});
