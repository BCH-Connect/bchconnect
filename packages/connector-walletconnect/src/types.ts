import type {
	ProtocolDefinition,
	SignMessageRequest,
	SignMessageResponse,
	SignTransactionRequest,
	SignTransactionResponse,
} from "@bchconnect/core";

/**
 * CAIP-2 chain id of a Bitcoin Cash network in the `bch` namespace.
 *
 * @beta
 */
export type WalletConnectChain =
	| "bch:bitcoincash"
	| "bch:bchtest"
	| "bch:bchreg";

/**
 * What a WalletConnect session yields once the wallet approves it.
 *
 * @beta
 */
export interface WalletConnectSessionData {
	/** The session's chain; always the one mapped from the client's network. */
	readonly chain: WalletConnectChain;
	/** Cash addresses the wallet approved for `chain`, in the wallet's order. Never empty. */
	readonly addresses: readonly string[];
	/** Method names the wallet approved for this session. */
	readonly methods: readonly string[];
}

/**
 * The requests every `bch-wc2` wallet is expected to serve.
 *
 * @beta
 */
export interface WalletConnectStandardMethods {
	/** The addresses the wallet exposes for the session's chain. */
	// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
	bch_getAddresses: { params: undefined; result: string[] };
	/** Asks the wallet to sign a transaction. */
	// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
	bch_signTransaction: {
		params: SignTransactionRequest;
		result: SignTransactionResponse;
		userInteraction: true;
	};
	/** Asks the wallet to sign a message. */
	// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
	bch_signMessage: {
		params: SignMessageRequest;
		result: SignMessageResponse;
		userInteraction: true;
	};
}

/**
 * Requests outside the standard ones, declared by the dapp. Empty until
 * augmented. A declared method can be sent with `client.request()` on any
 * session whose wallet approved it; its result is returned as the wallet
 * sent it, unchecked.
 *
 * @example
 * ```ts
 * declare module "@bchconnect/connector-walletconnect" {
 *   interface WalletConnectCustomMethods {
 *     bch_cancelPendingRequests: {
 *       params: Record<string, never>;
 *       result: { cancelledCount: number };
 *     };
 *   }
 * }
 * ```
 *
 * @beta
 */
// biome-ignore lint/suspicious/noEmptyInterface: dapps add members by declaration merging.
export interface WalletConnectCustomMethods {}

/**
 * Protocol definition of the `bch-wc2` WalletConnect protocol.
 *
 * @example
 * ```ts
 * import type { MethodName } from "@bchconnect/core";
 * import type { WalletConnect } from "@bchconnect/connector-walletconnect";
 *
 * type Methods = MethodName<WalletConnect>;
 * // "bch_getAddresses" | "bch_signTransaction" | "bch_signMessage"
 * ```
 *
 * @beta
 */
export interface WalletConnect extends ProtocolDefinition {
	/** Protocol id. */
	id: "bch-wc2";
	/** Data of an approved session. */
	session: WalletConnectSessionData;
	/** Requests a dapp can send to the wallet: the standard ones and the dapp's own. */
	methods: {
		[M in keyof WalletConnectStandardMethods]: WalletConnectStandardMethods[M];
	} & {
		[M in keyof WalletConnectCustomMethods]: WalletConnectCustomMethods[M];
	};
	/** Events the protocol surfaces; none are typed. */
	events: Record<never, never>;
	/** Capabilities a wallet can advertise. */
	capability: "libauth-signing" | "message-signing";
}

/**
 * Options of the WalletConnect connector.
 *
 * @beta
 */
export interface WalletConnectConfig {
	/** Project id from the WalletConnect dashboard; the default relay refuses connections without one. */
	projectId: string;
	/** Relay URL. Default: the SDK's (`wss://relay.walletconnect.org`). */
	relayUrl?: string;
	/**
	 * Custom methods to ask the wallet for, besides the standard ones. Declare
	 * them in {@link WalletConnectCustomMethods} first. A wallet that does not
	 * serve one still connects, without it.
	 */
	methods?: readonly (keyof WalletConnectCustomMethods)[];
}
