import { CapabilityMissingError, ConfigError } from "../errors.js";
import type { Client } from "../types/client.js";
import type {
	ProtocolDefinition,
	RequestOptions,
	SessionOf,
} from "../types/protocol.js";
import type {
	SignTransactionRequest,
	SignTransactionResponse,
	Transaction,
} from "../types/transaction.js";

const MAX_SATOSHIS = 2_100_000_000_000_000n;

// A hex transaction is passed through as is: reading its amounts would mean
// decoding it, which core does not do.
function assertOutputAmounts(transaction: Transaction): void {
	transaction.outputs.forEach((output, index) => {
		if (output.valueSatoshis < 0n || output.valueSatoshis > MAX_SATOSHIS) {
			throw new ConfigError(
				`Output ${index} value is outside 0 to 21 million BCH`,
			);
		}
		if (output.token !== undefined && output.token.amount < 0n) {
			throw new ConfigError(`Output ${index} token amount is negative`);
		}
	});
}

/**
 * Asks the wallet behind `session` to sign a transaction, through the
 * session's `"libauth-signing"` capability.
 *
 * @param client - The client the session belongs to.
 * @param session - The session to sign with.
 * @param req - The transaction and the outputs its inputs spend.
 * @param opts - Cancellation, deadline and correlation id of the request.
 * @returns The signed transaction and its hash.
 * @throws {@link ConfigError} when an output of a decoded transaction has a
 * value below zero or above 21 million BCH, or a negative token amount;
 * {@link CapabilityMissingError} when the session cannot sign transactions;
 * and {@link SessionMissingError} when it is no longer connected.
 *
 * @example
 * ```ts
 * const { signedTransaction } = await signTransaction(client, session, {
 *   transaction,
 *   sourceOutputs,
 * });
 * ```
 *
 * @public
 */
export async function signTransaction<P extends ProtocolDefinition>(
	client: Client<P>,
	session: SessionOf<P>,
	req: SignTransactionRequest,
	opts?: RequestOptions,
): Promise<SignTransactionResponse> {
	const signing = client.capability(session, "libauth-signing");
	if (signing === null) {
		throw new CapabilityMissingError('Session lacks "libauth-signing"', {
			sessionId: session.id,
		});
	}
	if (typeof req.transaction !== "string") {
		assertOutputAmounts(req.transaction);
	}
	return signing.signTransaction(req, opts);
}
