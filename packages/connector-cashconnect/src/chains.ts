import type { Network } from "@bchconnect/core";
import type { CashConnectChain } from "./types.js";

/**
 * The chain id a session uses on each network.
 *
 * @internal
 */
export const chains: Readonly<Record<Network, CashConnectChain>> = {
	mainnet: "bitcoincash",
	chipnet: "bchtest",
	regtest: "bchreg",
};
