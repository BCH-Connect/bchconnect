import type { Network } from "@bchconnect/core";
import type { WalletConnectChain } from "./types.js";

/** The chain id a session uses on each network. */
export const chains: Readonly<Record<Network, WalletConnectChain>> = {
	mainnet: "bch:bitcoincash",
	chipnet: "bch:bchtest",
	regtest: "bch:bchreg",
};
