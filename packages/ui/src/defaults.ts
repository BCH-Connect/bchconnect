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
 * The wallets BCH Connect ships logos and a support matrix for, in the order
 * the wallet list shows them.
 *
 * @example
 * ```ts
 * const wallets: WalletOption[] = BCHC_WALLETS.filter((wallet) =>
 *   wallet.protocols.includes(view.protocol),
 * ).map((wallet) => ({
 *   id: wallet.id,
 *   name: wallet.name,
 *   logo: wallet.logo,
 *   href: null,
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
	},
	{
		id: "paytaca",
		name: "Paytaca",
		logo: LOGO_PAYTACA,
		protocols: ["wizardconnect", "walletconnect"],
	},
	{
		id: "selene",
		name: "Selene",
		logo: LOGO_SELENE,
		protocols: ["walletconnect"],
	},
	{
		id: "optn",
		name: "OPTN",
		logo: LOGO_OPTN,
		protocols: ["wizardconnect", "walletconnect", "cashconnect"],
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
		link: { label: "Get Cashonize", href: "https://about.cashonize.com/" },
	},
	{
		id: "selene",
		name: "Selene",
		logo: LOGO_SELENE,
		link: { label: "Get Selene", href: "https://selene.cash" },
	},
	{
		id: "paytaca",
		name: "Paytaca",
		logo: LOGO_PAYTACA,
		link: { label: "Get Paytaca", href: "https://paytaca.com" },
	},
	{
		id: "optn",
		name: "OPTN",
		logo: LOGO_OPTN,
		link: { label: "Get OPTN", href: "https://optn.cash" },
	},
];
