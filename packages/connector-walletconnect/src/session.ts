import {
	type BchConnectError,
	InvalidWalletResponseError,
	NetworkMismatchError,
	type Session,
	type WalletIdentity,
} from "@bchconnect/core";
import { isNonEmptyString, isStringList } from "./guards.js";
import type { SdkSession } from "./sdk.js";
import type {
	WalletConnect,
	WalletConnectChain,
	WalletConnectSessionData,
} from "./types.js";

const NAMESPACE = "bch";

/**
 * A validated value, or the error that rejects it.
 *
 * @internal
 */
export type Parsed<T> =
	| { readonly data: T }
	| { readonly error: BchConnectError };

/** Whether `account` is a CAIP-10 account on any `bch` chain. */
function isBchAccount(account: string): boolean {
	return /^bch:[^:]+:.+$/.test(account);
}

/**
 * Reads the session data from the namespaces a wallet approved. A wallet may
 * approve less than was proposed: no method is required, and accounts on
 * other chains are ignored.
 *
 * @internal
 */
export function parseData(
	namespaces: unknown,
	chain: WalletConnectChain,
): Parsed<WalletConnectSessionData> {
	const invalid = {
		error: new InvalidWalletResponseError(
			"The wallet approved no usable bch namespace",
		),
	};
	if (typeof namespaces !== "object" || namespaces === null) return invalid;

	const namespace: unknown =
		NAMESPACE in namespaces ? namespaces[NAMESPACE] : undefined;
	if (
		typeof namespace !== "object" ||
		namespace === null ||
		!("accounts" in namespace) ||
		!Array.isArray(namespace.accounts) ||
		!("methods" in namespace) ||
		!isStringList(namespace.methods)
	) {
		return invalid;
	}

	const accounts = namespace.accounts.filter(
		(account): account is string =>
			typeof account === "string" && isBchAccount(account),
	);
	// The cash address is the account without its namespace: `bch:bchtest:q…` → `bchtest:q…`.
	const addresses = accounts
		.filter((account) => account.startsWith(`${chain}:`))
		.map((account) => account.slice(NAMESPACE.length + 1));
	if (addresses.length > 0) {
		return { data: { chain, addresses, methods: [...namespace.methods] } };
	}
	if (accounts.length > 0) {
		return {
			error: new NetworkMismatchError(
				`The wallet approved no account on ${chain}`,
			),
		};
	}
	return invalid;
}

/**
 * The wallet's identity, from the metadata it sent. A wallet may send none.
 *
 * @internal
 */
export function parseWallet(metadata: unknown): WalletIdentity {
	if (
		typeof metadata !== "object" ||
		metadata === null ||
		!("name" in metadata) ||
		!isNonEmptyString(metadata.name)
	) {
		return { source: "selection" };
	}

	const icon: unknown =
		"icons" in metadata && Array.isArray(metadata.icons)
			? metadata.icons[0]
			: undefined;
	return isNonEmptyString(icon)
		? { name: metadata.name, icon, source: "protocol" }
		: { name: metadata.name, source: "protocol" };
}

/**
 * Builds the connector's session from a session the SDK holds.
 * `relayConnected` is whether the SDK's relay connection is up.
 *
 * @internal
 */
export function toSession(
	raw: SdkSession,
	chain: WalletConnectChain,
	relayConnected: boolean,
):
	| { readonly session: Session<WalletConnect> }
	| { readonly error: BchConnectError } {
	const parsed = parseData(raw.namespaces, chain);
	if ("error" in parsed) return parsed;

	return {
		session: {
			id: raw.topic,
			protocol: "bch-wc2",
			wallet: parseWallet(raw.peer.metadata),
			data: parsed.data,
			status: {
				transport: relayConnected ? "connected" : "reconnecting",
				peer: "unknown",
			},
		},
	};
}
