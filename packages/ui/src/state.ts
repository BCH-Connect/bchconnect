// What the modal renders. Types only; the modal has no connection logic of its own.

/**
 * Off-mainnet networks get a badge; mainnet does not. Mirrors
 * `@bchconnect/core`'s `Network`.
 *
 * @beta
 */
export type Network = "mainnet" | "chipnet" | "regtest";

export const NETWORK_LABEL: Readonly<Record<Network, string>> = {
	mainnet: "Mainnet",
	chipnet: "Chipnet",
	regtest: "Regtest",
};

/**
 * Which connect protocol a session uses.
 *
 * @beta
 */
export type ProtocolId = "wizardconnect" | "walletconnect" | "cashconnect";

/**
 * How a protocol's mark fills its bounds: `tile` is already a plate;
 * `glyph` needs one composed around it (see `code.ts`).
 *
 * @beta
 */
export type MarkShape = "tile" | "glyph";

/**
 * A protocol's mark, as drawn into the connection code.
 *
 * @beta
 */
export interface ProtocolMark {
	/** Where the mark's image is served from. */
	readonly src: string;
	/** Whether the mark is a solid tile or a glyph that needs a plate. */
	readonly shape: MarkShape;
}

/**
 * One session type a visitor can choose.
 *
 * @beta
 */
export interface ProtocolOption {
	/** The protocol's identifier. */
	readonly id: ProtocolId;
	/** The protocol's name, as shown in the session-type control. */
	readonly name: string;
	/** The protocol's mark, embedded in the code rather than laid on top. */
	readonly mark: ProtocolMark | null;
}

/**
 * Which face of the modal is showing.
 *
 * @beta
 */
export type ModalScreen = "connect" | "wallets";

/**
 * A wallet in the directory, with somewhere to get it. Separate from
 * {@link WalletOption}: one you can open now, versus one you could install.
 *
 * @beta
 */
export interface WalletDirectoryEntry {
	/** A stable identifier for the wallet. */
	readonly id: string;
	/** The wallet's display name. */
	readonly name: string;
	/** The wallet's logo, as a URL or data URI, or `null` to show a generic wallet mark. */
	readonly logo: string | null;
	/**
	 * Where to get the wallet, or `null` when there is nowhere to send
	 * visitors yet. The row is then shown with no link. `label` is optional;
	 * without it the modal falls back to `messages.getWallet(name)`.
	 */
	readonly link: { readonly label?: string; readonly href: string } | null;
}

/**
 * A wallet listed in the modal. Selecting it narrows the session-type tabs to
 * its `protocols`; its `href`, when present, opens it on the desktop.
 *
 * @beta
 */
export interface WalletOption {
	/** A stable identifier for the wallet. */
	readonly id: string;
	/** The wallet's display name. */
	readonly name: string;
	/** The wallet's logo, as a URL or data URI, or `null` to show a generic wallet mark. */
	readonly logo: string | null;
	/** Every session type this wallet can open a connection with. */
	readonly protocols: readonly ProtocolId[];
	/**
	 * The wallet's desktop link, or `null` when it has none; the wallet is
	 * then connected by scanning. A `{link}` in it is replaced with the live
	 * connection link, URI-encoded.
	 */
	readonly href: string | null;
}

/**
 * A wallet, the session types it speaks and its desktop link; the caller
 * keeps those that speak an enabled protocol and builds a
 * {@link WalletOption} from each.
 *
 * @beta
 */
export interface WalletSupport {
	/** A stable identifier for the wallet. */
	readonly id: string;
	/** The wallet's display name. */
	readonly name: string;
	/** The wallet's logo, as a URL or data URI. */
	readonly logo: string;
	/** Every session type this wallet can open a connection with. */
	readonly protocols: readonly ProtocolId[];
	/** The wallet's desktop link, as in {@link WalletOption.href}, or `null` when it has none. */
	readonly href: string | null;
}

/**
 * Why a connection did not happen; mirrors the client's failure modes
 * (`aborted` = user-side, `rejected` = wallet-side).
 *
 * @beta
 */
export type FailureReason =
	| "rejected"
	| "timeout"
	| "aborted"
	| "transport"
	| "network-mismatch"
	| "unsupported";

/**
 * Where the attempt is. `initiating` exists only for protocols whose link
 * comes from a relay; WizardConnect skips it.
 *
 * @beta
 */
export type ConnectPhase =
	| { readonly kind: "initiating" }
	| {
			readonly kind: "awaiting-approval";
			readonly link: string;
	  }
	/**
	 * Success is not a screen: the modal closes itself on this, and the
	 * caller shows what it likes in its place. `bchc-toast` is the one
	 * shipped here.
	 */
	| {
			readonly kind: "connected";
			/** `null` when the wallet didn't identify itself. */
			readonly walletName: string | null;
			/** The wallet's logo, so the success moment shows who answered. */
			readonly walletLogo: string | null;
	  }
	| { readonly kind: "failed"; readonly reason: FailureReason };

/**
 * The whole of what the modal renders, for one state of one attempt.
 *
 * @beta
 */
export interface ModalView {
	/** The screen to show. */
	readonly screen: ModalScreen;
	/** The session type currently selected. Must be one of `protocols[].id`. */
	readonly protocol: ProtocolId;
	/** Every session type the visitor may choose between. */
	readonly protocols: readonly ProtocolOption[];
	/**
	 * Every wallet that speaks at least one of `protocols`, never filtered by
	 * `protocol`. Shown on a wide viewport only.
	 */
	readonly wallets: readonly WalletOption[];
	/**
	 * The selected wallet's id. `null`, or an id not in `wallets`, selects the
	 * first of `wallets` that speaks `protocol`, else the first listed.
	 */
	readonly wallet: string | null;
	/** Every wallet worth installing, for the "Get a wallet" screen. */
	readonly directory: readonly WalletDirectoryEntry[];
	/** The network the connection would be made on. */
	readonly network: Network;
	/** Where the attempt currently is. */
	readonly phase: ConnectPhase;
}
