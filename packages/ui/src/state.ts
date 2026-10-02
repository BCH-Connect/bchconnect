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
	/** The wallet's logo, as a URL or data URI. */
	readonly logo: string;
	/** Where to get the wallet, one link per platform or store. */
	readonly links: readonly { readonly label: string; readonly href: string }[];
}

/**
 * A wallet listed in the modal. Choosing it opens its `href`.
 *
 * @beta
 */
export interface WalletOption {
	/** A stable identifier for the wallet. */
	readonly id: string;
	/** The wallet's display name. */
	readonly name: string;
	/** The wallet's logo, as a URL or data URI. */
	readonly logo: string;
	/** The wallet's link, or `null` when it has none on this platform. The row is then shown disabled. */
	readonly href: string | null;
}

/**
 * A wallet and the session types it speaks; the caller filters by protocol
 * and builds a {@link WalletOption} from each match.
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
	/** The session type currently selected. */
	readonly protocol: ProtocolId;
	/** Every session type the visitor may choose between. */
	readonly protocols: readonly ProtocolOption[];
	/** Already filtered: wallets that do not support the protocol are absent. Shown on a wide viewport only. */
	readonly wallets: readonly WalletOption[];
	/** Every wallet worth installing, for the "Get a wallet" screen. */
	readonly directory: readonly WalletDirectoryEntry[];
	/** The network the connection would be made on. */
	readonly network: Network;
	/** Where the attempt currently is. */
	readonly phase: ConnectPhase;
}

// Second person, plain, no exclamation marks; never a code, URI, or transport name.
export const FAILURE_COPY: Readonly<
	Record<FailureReason, { readonly title: string; readonly detail: string }>
> = {
	rejected: {
		title: "Your wallet declined",
		detail: "Nothing was shared and nothing was sent.",
	},
	timeout: {
		title: "No answer from your wallet",
		detail: "It may have closed before approving. You can try again.",
	},
	aborted: {
		title: "Connection stopped",
		detail: "The request ended before your wallet answered.",
	},
	transport: {
		title: "Couldn't reach your wallet",
		detail: "Try again in a moment.",
	},
	"network-mismatch": {
		title: "Your wallet is on a different network",
		detail: "Switch networks in your wallet, then connect again.",
	},
	unsupported: {
		title: "That wallet can't use this session type",
		detail: "Choose another session type, or another wallet.",
	},
};
