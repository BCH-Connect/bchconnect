// Network, protocol and wallet names are data, not copy, and stay out of the catalogue.

/**
 * One key per string shown or announced by `bchc-modal` and `bchc-toast`. A
 * key that takes a value is a function of that value, so each language
 * orders its own words.
 *
 * @beta
 */
export interface BchcMessages {
	/** The catalogue's language, as a BCP 47 tag. The element sets it on its shadow content. */
	readonly lang: string;
	/** Dialog title on the connect screen. */
	readonly connectTitle: string;
	/** Dialog title on the "Get a wallet" screen. */
	readonly getWalletTitle: string;
	/** Label above the session-type control. */
	readonly sessionType: string;
	/** Caption shown while awaiting the wallet's scan. */
	readonly scan: string;
	/** Caption shown while the connection link is still being fetched. */
	readonly initiating: string;
	/** Hint shown once a deep link appears not to have opened anything. */
	readonly linkFailed: string;
	/** Copy-link button, idle. */
	readonly copyLink: string;
	/** Copy-link button, just after copying. */
	readonly linkCopied: string;
	/** Accessible name for the connection code, which doubles as the copy-link control. */
	readonly copyLinkLabel: string;
	/** Primary call to action on the sheet layout: opens the wallet's deep link. */
	readonly openInWallet: string;
	/** Section label above the wallet list on the split layout. */
	readonly walletsHeading: string;
	/** Link to the wallet directory, shown under the wallet list. */
	readonly noWallet: string;
	/** Section label on the "Get a wallet" screen. */
	readonly directoryHeading: string;
	/** Link label for a directory entry that carries no label of its own. */
	readonly getWallet: (name: string) => string;
	/** Retry button after a failed connection attempt. */
	readonly tryAgain: string;
	/** Back button on the "Get a wallet" screen. */
	readonly back: string;
	/** Close button. */
	readonly close: string;
	/** Toast heading when the wallet didn't identify itself. */
	readonly walletConnected: string;
	/** Toast heading naming the wallet that connected. */
	readonly connectedTo: (wallet: string) => string;
	/** Accessible name for the toast's dismiss button. */
	readonly dismiss: string;
	/** Failure title: the wallet declined the request. */
	readonly rejectedTitle: string;
	/** Failure detail: the wallet declined the request. */
	readonly rejectedDetail: string;
	/** Failure title: the wallet never answered. */
	readonly timeoutTitle: string;
	/** Failure detail: the wallet never answered. */
	readonly timeoutDetail: string;
	/** Failure title: the attempt was stopped before the wallet answered. */
	readonly abortedTitle: string;
	/** Failure detail: the attempt was stopped before the wallet answered. */
	readonly abortedDetail: string;
	/** Failure title: the wallet could not be reached. */
	readonly transportTitle: string;
	/** Failure detail: the wallet could not be reached. */
	readonly transportDetail: string;
	/** Failure title: the wallet is on a different network than the attempt. */
	readonly networkMismatchTitle: string;
	/** Failure detail: the wallet is on a different network than the attempt. */
	readonly networkMismatchDetail: string;
	/** Failure title: the wallet does not support the chosen session type. */
	readonly unsupportedTitle: string;
	/** Failure detail: the wallet does not support the chosen session type. */
	readonly unsupportedDetail: string;
}

/**
 * The English catalogue. It ships in the main entry and is what both
 * elements show when no `messages` override or locale is set.
 *
 * @beta
 */
export const BCHC_MESSAGES_EN: BchcMessages = {
	lang: "en",
	connectTitle: "Connect a wallet",
	getWalletTitle: "Get a wallet",
	sessionType: "Session type",
	scan: "Scan with your wallet",
	initiating: "Getting your connection link",
	linkFailed: "Didn't open? Copy the link.",
	copyLink: "Copy link",
	linkCopied: "Link copied",
	copyLinkLabel: "Copy connection link",
	openInWallet: "Open in your wallet",
	walletsHeading: "Open in your wallet",
	noWallet: "Don't have a wallet?",
	directoryHeading: "Bitcoin Cash wallets that work here",
	getWallet: (name) => `Get ${name}`,
	tryAgain: "Try again",
	back: "Back",
	close: "Close",
	walletConnected: "Wallet connected",
	connectedTo: (wallet) => `Connected to ${wallet}`,
	dismiss: "Dismiss",
	// Second person, plain, no exclamation marks; never a code, URI, or transport name.
	rejectedTitle: "Your wallet declined",
	rejectedDetail: "Nothing was shared and nothing was sent.",
	timeoutTitle: "No answer from your wallet",
	timeoutDetail: "It may have closed before approving. You can try again.",
	abortedTitle: "Connection stopped",
	abortedDetail: "The request ended before your wallet answered.",
	transportTitle: "Couldn't reach your wallet",
	transportDetail: "Try again in a moment.",
	networkMismatchTitle: "Your wallet is on a different network",
	networkMismatchDetail: "Switch networks in your wallet, then connect again.",
	unsupportedTitle: "That wallet can't use this session type",
	unsupportedDetail: "Choose another session type, or another wallet.",
};

/**
 * The English catalogue with `overrides` applied key by key.
 *
 * @internal
 */
export function mergeMessages(
	overrides: Partial<BchcMessages> | null,
): BchcMessages {
	// JavaScript callers can pass `undefined` or `null` despite the type, for the whole
	// catalogue or a key; either keeps English instead of throwing or blanking a string.
	if (overrides == null) return BCHC_MESSAGES_EN;
	const defined = Object.entries(overrides).filter(
		([, value]) => value != null,
	);
	return { ...BCHC_MESSAGES_EN, ...Object.fromEntries(defined) };
}
