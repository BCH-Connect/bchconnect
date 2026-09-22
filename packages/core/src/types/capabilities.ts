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
	): Promise<SignTransactionResponse>;
}

/**
 * Signs arbitrary messages.
 *
 * @public
 */
export interface MessageSigning {
	/** Asks the wallet to sign a message. */
	signMessage(req: SignMessageRequest): Promise<SignMessageResponse>;
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
