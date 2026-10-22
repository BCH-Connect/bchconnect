// A dapp can pass its own ProtocolOption, WalletSupport and
// WalletDirectoryEntry lists instead. Touches neither `qr-code-styling` nor
// the DOM, so it's as server-safe as `state.ts`.

import {
	LOGO_CASHONIZE,
	LOGO_OPTN,
	LOGO_PAYTACA,
	LOGO_SELENE,
	MARK_CASHCONNECT,
	MARK_WALLETCONNECT,
	MARK_WIZARDCONNECT,
} from "./assets.generated.ts";
import type {
	ProtocolOption,
	WalletDirectoryEntry,
	WalletSupport,
} from "./state.ts";

/**
 * The session types BCH Connect ships marks for, in the order the
 * session-type control shows them.
 *
 * @beta
 */
export const BCHC_PROTOCOLS: readonly ProtocolOption[] = [
	{
		id: "wizardconnect",
		name: "WizardConnect",
		mark: { src: MARK_WIZARDCONNECT, shape: "glyph" },
	},
	{
		id: "walletconnect",
		name: "WalletConnect",
		mark: { src: MARK_WALLETCONNECT, shape: "tile" },
	},
	{
		id: "cashconnect",
		name: "CashConnect",
		mark: { src: MARK_CASHCONNECT, shape: "glyph" },
	},
];

/**
 * The wallets BCH Connect ships logos, a support matrix and desktop links
 * for, in the order the wallet list shows them.
 *
 * @example
 * ```ts
 * const enabled = view.protocols.map((protocol) => protocol.id);
 * const wallets: WalletOption[] = BCHC_WALLETS.filter((wallet) =>
 *   wallet.protocols.some((protocol) => enabled.includes(protocol)),
 * ).map((wallet) => ({
 *   ...wallet,
 *   protocols: wallet.protocols.filter((protocol) => enabled.includes(protocol)),
 * }));
 * ```
 *
 * @beta
 */
export const BCHC_WALLETS: readonly WalletSupport[] = [
	{
		id: "cashonize",
		name: "Cashonize",
		logo: LOGO_CASHONIZE,
		protocols: ["wizardconnect", "walletconnect", "cashconnect"],
		// The web app reads `uri` on its root route.
		href: "https://cashonize.com/?uri={link}",
	},
	{
		id: "paytaca",
		name: "Paytaca",
		logo: LOGO_PAYTACA,
		protocols: ["wizardconnect", "walletconnect"],
		href: null,
	},
	{
		id: "selene",
		name: "Selene",
		logo: LOGO_SELENE,
		protocols: ["wizardconnect", "walletconnect"],
		href: null,
	},
	{
		id: "optn",
		name: "OPTN",
		logo: LOGO_OPTN,
		protocols: ["wizardconnect", "walletconnect", "cashconnect"],
		// optn.cash is the project's site, not the wallet.
		href: null,
	},
];

/**
 * Where to actually get each wallet in {@link BCHC_WALLETS}, for the "Get a
 * wallet" screen.
 *
 * Official sites only: app-store links are unsupplied, and guessing them
 * risks pointing users to the wrong app.
 *
 * @beta
 */
export const BCHC_DIRECTORY: readonly WalletDirectoryEntry[] = [
	{
		id: "cashonize",
		name: "Cashonize",
		logo: LOGO_CASHONIZE,
		link: { href: "https://about.cashonize.com/" },
	},
	{
		id: "selene",
		name: "Selene",
		logo: LOGO_SELENE,
		link: { href: "https://selene.cash" },
	},
	{
		id: "paytaca",
		name: "Paytaca",
		logo: LOGO_PAYTACA,
		link: { href: "https://paytaca.com" },
	},
	{
		id: "optn",
		name: "OPTN",
		logo: LOGO_OPTN,
		link: { href: "https://optn.cash" },
	},
];
