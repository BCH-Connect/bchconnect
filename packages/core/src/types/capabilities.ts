import type {
	MethodName,
	MethodParams,
	MethodResult,
	ProtocolDefinition,
	RequestOptions,
} from "./protocol.js";
import type {
	SignMessageRequest,
	SignMessageResponse,
	SignTransactionRequest,
	SignTransactionResponse,
} from "./transaction.js";

/**
 * Signs transactions built with libauth-compatible types.
 *
 * @public
 */
export interface LibauthSigning {
	/** Asks the wallet to sign a transaction. */
	signTransaction(
		req: SignTransactionRequest,
		opts?: RequestOptions,
	): Promise<SignTransactionResponse>;
}

/**
 * Signs arbitrary messages.
 *
 * @public
 */
export interface MessageSigning {
	/** Asks the wallet to sign a message. */
	signMessage(
		req: SignMessageRequest,
		opts?: RequestOptions,
	): Promise<SignMessageResponse>;
}

/**
 * Maps capability names to their interfaces. Protocol packages augment it
 * with cross-protocol capabilities.
 *
 * @public
 */
export interface CapabilityRegistry {
	/** See {@link LibauthSigning}. */
	"libauth-signing": LibauthSigning;
	/** See {@link MessageSigning}. */
	"message-signing": MessageSigning;
}

/**
 * The client, bound to one session, as a connector receives it to build that
 * session's capabilities. Its `request()` is the client's own, so every call
 * keeps the client's deadlines, cancellation and events.
 *
 * @example
 * ```ts
 * const connector: Connector<Wc2> = {
 *   // ...the other connector members
 *
 *   // The client calls this with the session and its SessionClient.
 *   capabilities(session, client) {
 *     return {
 *       "libauth-signing": {
 *         signTransaction(req, opts) {
 *           return client.request("bch_signTransaction", req, opts);
 *         },
 *       },
 *     };
 *   },
 * };
 * ```
 *
 * @public
 */
export interface SessionClient<P extends ProtocolDefinition> {
	/** Sends a protocol method over the bound session. */
	request<M extends MethodName<P>>(
		method: M,
		params: MethodParams<P, M>,
		opts?: RequestOptions,
	): Promise<MethodResult<P, M>>;
}

/**
 * The capability interfaces a connector supplies for one session, by name.
 * Only names that are both in the protocol's capabilities and in
 * {@link CapabilityRegistry} can appear.
 *
 * @public
 */
export type CapabilityMap<P extends ProtocolDefinition> = {
	readonly [N in P["capability"] &
		keyof CapabilityRegistry]?: CapabilityRegistry[N];
};
