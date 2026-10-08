// Consumer-supplied wallet and directory data the modal has no control over:
// a dapp builds these lists itself, so the component has to render whatever
// shape, script, length, or broken reference lands in them.

import type { WalletDirectoryEntry, WalletOption } from "../src/state.ts";

/** A tiny inline logo: a consumer never has to host an image file to brand a wallet row. */
export const SVG_LOGO =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%230AC18E'/%3E%3C/svg%3E";

/** A same-origin path that 404s against the Storybook server: deterministic and fast, unlike a real network timeout. */
export const BROKEN_LOGO = "./missing-logo-404.png";

export const HTML_LIKE_NAME = "<img src=x onerror=alert(1)>";
export const LONG_NAME =
	"Ultra Secure Multi-Chain Bitcoin Cash Hardware-Backed Wallet for Professional Treasury Operations";
export const CJK_NAME = "比特币现金钱包应用程序";
export const EMOJI_NAME = "🦊 Fox Wallet 🔥💰";
export const ARABIC_NAME = "محفظة بيتكوين كاش الرسمية";
export const HEBREW_NAME = "ארנק ביטקוין כאש הרשמי";

/** `count` plain wallets, cheap SVG logo, each with a working link. */
export function manyWallets(count: number): WalletOption[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `wallet-${index}`,
		name: `Wallet ${index + 1}`,
		logo: SVG_LOGO,
		href: `https://example.com/wallet-${index}`,
	}));
}

/** `count` plain directory entries, one link each. */
export function manyDirectory(count: number): WalletDirectoryEntry[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `wallet-${index}`,
		name: `Wallet ${index + 1}`,
		logo: SVG_LOGO,
		link: { label: "Get it", href: `https://example.com/wallet-${index}` },
	}));
}

export const LONG_NAME_WALLET: WalletOption = {
	id: "long-name",
	name: LONG_NAME,
	logo: SVG_LOGO,
	href: "https://example.com/long",
};

export const LONG_NAME_DIRECTORY_ENTRY: WalletDirectoryEntry = {
	id: "long-name",
	name: LONG_NAME,
	logo: SVG_LOGO,
	link: { label: "Get it", href: "https://example.com/long" },
};

export const LONG_LINK_LABEL_DIRECTORY_ENTRY: WalletDirectoryEntry = {
	id: "long-label",
	name: "Everyday Wallet",
	logo: SVG_LOGO,
	link: {
		label: "Download the official app from the store for your platform",
		href: "https://example.com/long-label",
	},
};

/** No usable link: the row renders with no "Get it" pill at all. */
export const NO_LINK_DIRECTORY_ENTRY: WalletDirectoryEntry = {
	id: "no-link",
	name: "No Link Wallet",
	logo: SVG_LOGO,
	link: null,
};

/** One wallet per script, so the modal's LTR shell carries RTL and CJK runs. */
export const SCRIPT_WALLETS: readonly WalletOption[] = [
	{
		id: "cjk",
		name: CJK_NAME,
		logo: SVG_LOGO,
		href: "https://example.com/cjk",
	},
	{
		id: "emoji",
		name: EMOJI_NAME,
		logo: SVG_LOGO,
		href: "https://example.com/emoji",
	},
	{
		id: "arabic",
		name: ARABIC_NAME,
		logo: SVG_LOGO,
		href: "https://example.com/arabic",
	},
	{
		id: "hebrew",
		name: HEBREW_NAME,
		logo: SVG_LOGO,
		href: "https://example.com/hebrew",
	},
];

export const SCRIPT_DIRECTORY: readonly WalletDirectoryEntry[] =
	SCRIPT_WALLETS.map((wallet) => ({
		id: wallet.id,
		name: wallet.name,
		logo: wallet.logo,
		link: { label: "Get it", href: wallet.href ?? "" },
	}));

export const HTML_LIKE_WALLET: WalletOption = {
	id: "html-like",
	name: HTML_LIKE_NAME,
	logo: SVG_LOGO,
	href: "https://example.com/html-like",
};

export const HTML_LIKE_DIRECTORY_ENTRY: WalletDirectoryEntry = {
	id: "html-like",
	name: "Plain Name Wallet",
	logo: SVG_LOGO,
	link: { label: HTML_LIKE_NAME, href: "https://example.com/html-like" },
};

export const BROKEN_LOGO_WALLET: WalletOption = {
	id: "broken-logo",
	name: "Broken Logo Wallet",
	logo: BROKEN_LOGO,
	href: "https://example.com/broken-logo",
};

/** No logo at all: the modal shows the generic wallet tile, per `WalletOption.logo`'s contract. */
export const NULL_LOGO_WALLET: WalletOption = {
	id: "null-logo",
	name: "No Logo Wallet",
	logo: null,
	href: "https://example.com/null-logo",
};

/** No logo at all, for the directory screen. */
export const NULL_LOGO_DIRECTORY_ENTRY: WalletDirectoryEntry = {
	id: "null-logo",
	name: "No Logo Wallet",
	logo: null,
	link: { label: "Get it", href: "https://example.com/null-logo" },
};

export const SVG_LOGO_WALLET: WalletOption = {
	id: "svg-logo",
	name: "SVG Logo Wallet",
	logo: SVG_LOGO,
	href: "https://example.com/svg-logo",
};

/** No link on this platform: the modal shows the row disabled, per `WalletOption.href`'s contract. */
export const HREF_NULL_WALLET: WalletOption = {
	id: "no-link",
	name: "No Link Wallet",
	logo: SVG_LOGO,
	href: null,
};

/** A directory entry whose link has no real destination (a consumer that has no URL yet). */
export const HREF_EMPTY_DIRECTORY_ENTRY: WalletDirectoryEntry = {
	id: "no-href",
	name: "No Link Entry",
	logo: SVG_LOGO,
	link: { label: "Get it", href: "" },
};
