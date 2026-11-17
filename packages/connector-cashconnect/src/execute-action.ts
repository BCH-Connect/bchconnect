import type {
	Client,
	ProtocolDefinition,
	RequestOptions,
	Session,
} from "@bchconnect/core";
import type {
	CashConnectActionName,
	CashConnectActionParams,
	CashConnectActionResult,
	CashConnectTemplate,
} from "./template.js";
import type { CashConnect } from "./types.js";

/**
 * Runs one action of the session's template in the wallet and resolves with
 * that action's typed result. Same as `client.request()` with the method
 * `"executeAction"` and the action's name and params, with the result
 * narrowed to `action`.
 *
 * @param client - The client the session belongs to.
 * @param session - The CashConnect session to run the action in.
 * @param action - The name of an action of the session's template.
 * @param params - The action's params, typed by their declared types.
 * @param opts - Cancellation, deadline and correlation id of the request.
 * @returns The action's returned values, the transactions the wallet signed,
 * and the session's balance changes.
 *
 * @example
 * ```ts
 * const { data } = await executeAction(client, session, "send", {
 *   recipient: "bchtest:qr…",
 *   amount: 10_000n,
 * });
 * ```
 *
 * @beta
 */
export function executeAction<
	T extends CashConnectTemplate,
	A extends CashConnectActionName<T>,
	P extends ProtocolDefinition,
>(
	client: Client<NoInfer<CashConnect<T>> | P>,
	session: Session<CashConnect<T>>,
	action: A,
	params: CashConnectActionParams<T, A>,
	opts?: RequestOptions,
): Promise<CashConnectActionResult<T, A>> {
	// The wallet answers the action it was asked to run.
	return client.request(
		session,
		"executeAction",
		{ action, params },
		opts,
	) as Promise<CashConnectActionResult<T, A>>;
}
