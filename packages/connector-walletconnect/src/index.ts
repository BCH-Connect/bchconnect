/**
 * WalletConnect connector for BCH Connect. Speaks the `bch-wc2` protocol
 * through the WalletConnect sign client.
 *
 * @packageDocumentation
 */

export { walletConnect } from "./connector.js";
export type {
	WalletConnect,
	WalletConnectChain,
	WalletConnectConfig,
	WalletConnectCustomMethods,
	WalletConnectSessionData,
	WalletConnectStandardMethods,
} from "./types.js";
