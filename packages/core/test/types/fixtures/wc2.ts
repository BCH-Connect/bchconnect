/** bch-wc2 (WalletConnect v2) protocol definition. Signing uses core's types. */
import type {
	Connector,
	ProtocolDefinition,
	SignMessageRequest,
	SignMessageResponse,
	SignTransactionRequest,
	SignTransactionResponse,
} from "../../../src/index.js";

/** CAIP-2 chain ids for the `bch` namespace. */
type Wc2Chain = "bch:bitcoincash" | "bch:bchtest" | "bch:bchreg";

/** The handshake payload: what the WC session namespace yields. */
export interface Wc2SessionData {
	readonly address: string;
	readonly chain: Wc2Chain;
	/** Methods the wallet advertised in its namespace. */
	readonly advertisedMethods: readonly string[];
	readonly topic: string;
}

export interface Wc2 extends ProtocolDefinition {
	id: "bch-wc2";
	session: Wc2SessionData;
	methods: {
		// biome-ignore lint/style/useNamingConvention: wc2 wire method name.
		bch_getAddresses: { params: undefined; result: string[] };
		// biome-ignore lint/style/useNamingConvention: wc2 wire method name.
		bch_signTransaction: {
			params: SignTransactionRequest;
			result: SignTransactionResponse;
			userInteraction: true;
		};
		// biome-ignore lint/style/useNamingConvention: wc2 wire method name.
		bch_signMessage: {
			params: SignMessageRequest;
			result: SignMessageResponse;
			userInteraction: true;
		};
		// biome-ignore lint/style/useNamingConvention: wc2 wire method name.
		bch_cancelPendingRequests: { params: undefined; result: null };
	};
	events: {
		addressesChanged: { addresses: string[] };
	};
	capability: "libauth-signing" | "message-signing";
}

interface Wc2Config {
	projectId: string;
}

export declare function walletConnect(config: Wc2Config): Connector<Wc2>;
