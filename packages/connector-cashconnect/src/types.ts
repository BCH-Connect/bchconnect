import type { ProtocolDefinition, TransactionOutput } from "@bchconnect/core";
import type {
	CashConnectExecuteActionParams,
	CashConnectExecuteActionResult,
	CashConnectTemplate,
} from "./template.js";

/**
 * Chain id a CashConnect session runs on; also the network's CashAddr prefix.
 *
 * @beta
 */
export type CashConnectChain = "bitcoincash" | "bchtest" | "bchreg";

/**
 * Spendable balances the wallet exposes to the session: `sats`, plus one
 * entry per granted token category, keyed by lowercase hex.
 *
 * @beta
 */
export interface CashConnectBalances {
	/** Spendable satoshis. */
	readonly sats: bigint;
	/** Fungible token amount of a granted category. */
	readonly [category: string]: bigint;
}

/**
 * What a CashConnect session yields once the wallet approves it.
 *
 * @beta
 */
export interface CashConnectSessionData<
	T extends CashConnectTemplate = CashConnectTemplate,
> {
	/** The wallet's public key for this session, hex. Random per pairing: not a wallet or account id. Equals `session.id`. */
	readonly walletPubkey: string;
	/** The session's chain; always the one mapped from the client's network. */
	readonly chain: CashConnectChain;
	/** The template the session was established with, which the wallet runs. */
	readonly template: T;
	/** Token categories the wallet granted, lowercase hex. */
	readonly allowedTokens: readonly string[];
}

/**
 * Protocol definition of CashConnect, typed by its template.
 *
 * @example
 * ```ts
 * import type { MethodName } from "@bchconnect/core";
 * import type { CashConnect } from "@bchconnect/connector-cashconnect";
 *
 * type Methods = MethodName<CashConnect>;
 * // "getBalances" | "getTokens" | "executeAction"
 * ```
 *
 * @beta
 */
export interface CashConnect<
	T extends CashConnectTemplate = CashConnectTemplate,
> extends ProtocolDefinition {
	/** Protocol id. */
	id: "cashconnect";
	/** Data of an approved session. */
	session: CashConnectSessionData<T>;
	/** Requests a dapp can send to the wallet. */
	methods: {
		/** The session's spendable balances. */
		getBalances: { params: undefined; result: CashConnectBalances };
		/** The NFT-bearing outputs of the granted categories. */
		getTokens: { params: undefined; result: readonly TransactionOutput[] };
		/** Runs one template action in the wallet. */
		executeAction: {
			params: CashConnectExecuteActionParams<T>;
			result: CashConnectExecuteActionResult<T>;
			userInteraction: true;
		};
	};
	/** Events the wallet sends. */
	events: {
		/** The wallet's balances changed. */
		balancesChanged: { readonly balances: CashConnectBalances };
	};
	/** Every session can run its template's actions. */
	capability: "template-execution";
}

/**
 * Options of the CashConnect connector.
 *
 * @beta
 */
export interface CashConnectConfig<T extends CashConnectTemplate> {
	/** The template whose actions the wallet runs. The wallet keeps the copy it received at pairing. */
	readonly template: T;
	/** Token categories the dapp asks to see and spend, as 64-character lowercase hex. Default: none. */
	readonly allowedTokens?: readonly string[];
}
