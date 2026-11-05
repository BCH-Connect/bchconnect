import { CapabilityMissingError } from "../errors.js";
import type { Client } from "../types/client.js";
import type {
	ProtocolDefinition,
	RequestOptions,
	SessionOf,
} from "../types/protocol.js";
import type {
	SignMessageRequest,
	SignMessageResponse,
} from "../types/transaction.js";

/**
 * Asks the wallet behind `session` to sign a message, through the session's
 * `"message-signing"` capability.
 *
 * @param client - The client the session belongs to.
 * @param session - The session to sign with.
 * @param req - The message, and the text the wallet shows the user.
 * @param opts - Cancellation, deadline and correlation id of the request.
 * @returns The signature.
 * @throws {@link CapabilityMissingError} when the session cannot sign
 * messages, and {@link SessionMissingError} when it is no longer connected.
 *
 * @example
 * ```ts
 * const signature = await signMessage(client, session, { message: "hello" });
 * ```
 *
 * @public
 */
export async function signMessage<P extends ProtocolDefinition>(
	client: Client<P>,
	session: SessionOf<P>,
	req: SignMessageRequest,
	opts?: RequestOptions,
): Promise<SignMessageResponse> {
	const signing = client.capability(session, "message-signing");
	if (signing === null) {
		throw new CapabilityMissingError('Session lacks "message-signing"', {
			sessionId: session.id,
		});
	}
	return signing.signMessage(req, opts);
}
