/**
 * What the modal renders.
 *
 * Types only. The modal is a projection of the client's connect state machine,
 * so it owns no connection logic of its own — it is handed a view and draws it.
 * That is what lets the lab drive every state directly, including the ones that
 * are hard to reach against a real wallet.
 *
 * Provisional until SPEC section 8 is drafted. Nothing here is exported from a
 * package yet, and the names are expected to move once the spec pins them.
 */

/** Off-mainnet networks get a badge; mainnet does not. */
export type Network = "mainnet" | "chipnet" | "testnet4" | "regtest";

/** How each network is written for a person rather than for a config file. */
export const NETWORK_LABEL: Readonly<Record<Network, string>> = {
	mainnet: "Mainnet",
	chipnet: "Chipnet",
	testnet4: "Testnet4",
	regtest: "Regtest",
};

export type ProtocolId = "wizardconnect" | "walletconnect" | "cashconnect";

/**
 * How a protocol's mark fills its bounds.
 *
 * A `tile` is already a plate: a solid rounded square that fills its box edge
 * to edge, like WalletConnect's. A `glyph` has transparent edges, like a hat or
 * a disc, and would float loose in the hole the code leaves for it. The
 * renderer sets a glyph on a faint accent plate so it reads as placed rather
 * than dropped.
 */
export type MarkShape = "tile" | "glyph";

export interface ProtocolMark {
	readonly src: string;
	readonly shape: MarkShape;
}

export interface ProtocolOption {
	readonly id: ProtocolId;
	readonly name: string;
	/** The protocol's mark, buried in the code rather than laid on top. */
	readonly mark: ProtocolMark | null;
}

/**
 * Which face of the modal is showing.
 *
 * "Get a wallet" stays inside the modal rather than sending the visitor to a
 * website. On a phone that is the difference between a useful answer and a dead
 * end: someone with no wallet installed gets nothing from the deep link and
 * nothing from a native prompt, so the list of wallets has to be here.
 */
export type ModalScreen = "connect" | "wallets";

/**
 * A wallet in the directory, with somewhere to actually get it.
 *
 * Separate from {@link WalletOption} on purpose: one is "a wallet you can open
 * right now", the other is "a wallet you could install". Conflating them is how
 * a list ends up linking an app store from a connect button.
 */
export interface WalletDirectoryEntry {
	readonly id: string;
	readonly name: string;
	readonly logo: string;
	readonly links: readonly { readonly label: string; readonly href: string }[];
}

/**
 * A wallet is a link, not a selectable option: picking one opens it. The modal
 * never holds a "selected wallet" that the user has to then confirm.
 */
export interface WalletOption {
	readonly id: string;
	readonly name: string;
	readonly logo: string;
	/** Absent when the wallet has no same-device link on this platform. */
	readonly href: string | null;
}

/**
 * Why a connection did not happen.
 *
 * These mirror the client's failure modes. `aborted` is the user stopping it
 * from our side; `rejected` is the wallet declining from theirs.
 */
export type FailureReason =
	| "rejected"
	| "timeout"
	| "aborted"
	| "transport"
	| "network-mismatch"
	| "unsupported";

/**
 * Where the attempt is.
 *
 * `initiating` exists only for protocols whose link comes from a relay and so
 * cannot be shown immediately. WizardConnect skips it: its code is live the
 * moment the modal opens, which is the point of opening on a code at all.
 */
export type ConnectPhase =
	| { readonly kind: "initiating" }
	| {
			readonly kind: "awaiting-approval";
			readonly link: string;
	  }
	/**
	 * Success is not a screen. The modal closes itself on this, and the caller
	 * shows what it likes in its place — `bchc-toast` is the one shipped here.
	 */
	| {
			readonly kind: "connected";
			readonly walletName: string;
			/** The wallet's logo, so the success moment shows who answered. */
			readonly walletLogo: string | null;
	  }
	| { readonly kind: "failed"; readonly reason: FailureReason };

export interface ModalView {
	readonly screen: ModalScreen;
	readonly protocol: ProtocolId;
	readonly protocols: readonly ProtocolOption[];
	/**
	 * Already filtered: wallets that do not support the protocol are absent.
	 *
	 * Shown on a wide viewport only. On a phone the operating system knows what
	 * is installed and we do not, so the deep link asks it rather than the modal
	 * guessing — see the sheet layout.
	 */
	readonly wallets: readonly WalletOption[];
	/** Every wallet worth installing, for the "Get a wallet" screen. */
	readonly directory: readonly WalletDirectoryEntry[];
	readonly network: Network;
	readonly phase: ConnectPhase;
}

/**
 * User-facing copy for every failure.
 *
 * Second person, plain, no exclamation marks, and never a code, a URI or a
 * transport name — a person about to link a wallet holding money does not need
 * to learn our vocabulary to understand what went wrong.
 */
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
		detail: "You cancelled before your wallet answered.",
	},
	transport: {
		title: "Could not reach your wallet",
		detail: "Check your internet connection, then try again.",
	},
	"network-mismatch": {
		title: "Your wallet is on a different network",
		detail: "Switch networks in your wallet, then connect again.",
	},
	unsupported: {
		title: "That wallet cannot use this session type",
		detail: "Choose another session type, or another wallet.",
	},
};
