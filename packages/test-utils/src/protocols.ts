import type {
	ProtocolDefinition,
	Session,
	SignMessageRequest,
	SignMessageResponse,
	SignTransactionRequest,
	SignTransactionResponse,
} from "@bchconnect/core";
import { type FakeSessionInit, fakeSession } from "./session.js";

/**
 * Handshake payload of {@link DemoProtocol}: addresses, derivation paths and
 * the wallet's own name when it sent one.
 *
 * @beta
 */
export interface DemoSessionData {
	/** Addresses the wallet exposed, in wallet order. */
	readonly addresses: readonly string[];
	/** Named extended public keys. */
	readonly xpubs: readonly { readonly name: string; readonly xpub: string }[];
	/** Wallet name, when the protocol carries one. */
	readonly walletName?: string;
}

/**
 * A protocol definition for tests, shaped after a real wallet protocol.
 *
 * Its methods cover every branch of the timeout resolution order: a method
 * with no `timeoutMs` (the client's read default applies), one with its own
 * `timeoutMs`, and two `userInteraction` methods (no default deadline).
 *
 * @beta
 */
export interface DemoProtocol extends ProtocolDefinition {
	/** Protocol id. */
	id: "demo";
	/** Handshake payload. */
	session: DemoSessionData;
	/** Request-shaped methods. */
	methods: {
		/** A read with no parameters and no per-method deadline. */
		get_addresses: {
			params: undefined;
			result: { readonly addresses: readonly string[] };
		};
		/** A read carrying its own deadline. */
		get_balance: {
			params: { readonly address: string };
			result: { readonly sats: bigint };
			timeoutMs: 5_000;
		};
		/** Signing, gated on the user. */
		sign_transaction: {
			params: { readonly transaction: SignTransactionRequest };
			result: SignTransactionResponse;
			userInteraction: true;
		};
		/** Message signing, gated on the user. */
		sign_message: {
			params: SignMessageRequest;
			result: SignMessageResponse;
			userInteraction: true;
		};
	};
	/** Wallet-initiated messages. */
	events: {
		/** The wallet's address set changed. */
		addresses_changed: { readonly addresses: readonly string[] };
		/** The wallet finished loading and announced itself. */
		wallet_ready: { readonly walletName?: string };
	};
	/** Capabilities sessions of this protocol may have. */
	capability: "libauth-signing" | "message-signing";
}

/**
 * Handshake payload of {@link DemoAltProtocol}.
 *
 * @beta
 */
export interface DemoAltSessionData {
	/** The wallet's public key, its only identity on the wire. */
	readonly pubkey: Uint8Array;
}

/**
 * A second protocol definition, for multi-protocol tests.
 *
 * It shares the method name `get_balance` with {@link DemoProtocol} under a
 * different result type, and declares no events, so narrowing by
 * `session.protocol` can be exercised.
 *
 * @beta
 */
export interface DemoAltProtocol extends ProtocolDefinition {
	/** Protocol id. */
	id: "demo-alt";
	/** Handshake payload. */
	session: DemoAltSessionData;
	/** Request-shaped methods. */
	methods: {
		/** Same name as {@link DemoProtocol}'s, different result. */
		get_balance: {
			params: { readonly token?: string };
			result: bigint;
		};
	};
	/** This protocol has no wallet-initiated messages. */
	events: Record<never, never>;
	/** Capabilities sessions of this protocol may have. */
	capability: "message-signing";
}

/**
 * Builds a {@link DemoProtocol} session with placeholder data.
 *
 * @example
 * ```ts
 * const session = demoSession({ id: "s1" });
 * const other = demoSession({ data: { addresses: [], xpubs: [] } });
 * ```
 *
 * @beta
 */
export function demoSession(
	init: Partial<FakeSessionInit<DemoProtocol>> = {},
): Session<DemoProtocol> {
	return fakeSession<DemoProtocol>({
		...init,
		protocol: "demo",
		data: init.data ?? {
			addresses: ["bitcoincash:qpea4gc3r589sdqdcprsu6uyxpugpqnshsa8v7vsxq"],
			// Derived from the public BIP-39 test-vector mnemonic, at
			// m/44'/145'/0'. It holds nothing and belongs to nobody.
			xpubs: [
				{
					name: "receive",
					xpub: "xpub6ByHsPNSQXTWZ7PLESMY2FufyYWtLXagSUpMQq7Un96SiThZH2iJB1X7pwviH1WtKVeDP6K8d6xxFzzoaFzF3s8BKCZx8oEDdDkNnp4owAZ",
				},
			],
		},
	});
}

/**
 * Builds a {@link DemoAltProtocol} session with placeholder data.
 *
 * @example
 * ```ts
 * const session = demoAltSession({ id: "s2" });
 * ```
 *
 * @beta
 */
export function demoAltSession(
	init: Partial<FakeSessionInit<DemoAltProtocol>> = {},
): Session<DemoAltProtocol> {
	return fakeSession<DemoAltProtocol>({
		...init,
		protocol: "demo-alt",
		data: init.data ?? { pubkey: new Uint8Array([1, 2, 3]) },
	});
}
