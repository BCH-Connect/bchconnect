/** CashConnect protocol definition, typed by its template `T`. */
import type {
	ActionName,
	ActionParams,
	ActionResult,
	Template,
} from "@cashconnect-js/core/templates";
import type {
	Client,
	Connector,
	ProtocolDefinition,
	RequestOptions,
	Session,
} from "../../../src/index.js";

type CashConnectChain = "bitcoincash" | "bchtest" | "bchreg";

export interface CashConnectSessionData<T extends Template = Template> {
	/** The wallet's Nostr pubkey, its only identity on the wire. */
	readonly walletPubkey: string;
	readonly chain: CashConnectChain;
	readonly allowedTokens: readonly string[];
	/** The template, carried so sugar can infer `T` from the session. */
	readonly template: T;
}

/** `executeAction` params: a union discriminated by action name. */
type ExecuteActionParams<T extends Template> = {
	[A in ActionName<T>]: { action: A; params: ActionParams<T, A> };
}[ActionName<T>];

/** `executeAction` result: the union over all actions. */
export type ExecuteActionResult<T extends Template> = {
	[A in ActionName<T>]: ActionResult<T, A>;
}[ActionName<T>];

export interface CashConnect<T extends Template = Template>
	extends ProtocolDefinition {
	id: "cashconnect";
	session: CashConnectSessionData<T>;
	methods: {
		getBalances: {
			params: undefined;
			result: Record<string, bigint>;
			timeoutMs: 30_000;
		};
		executeAction: {
			params: ExecuteActionParams<T>;
			result: ExecuteActionResult<T>;
			userInteraction: true;
		};
	};
	events: {
		balancesChanged: { balances: Record<string, bigint> };
	};
	/** A capability name with no interface in the registry. */
	capability: "template-execution";
}

export declare function cashConnect<T extends Template>(config: {
	readonly template: T;
}): Connector<CashConnect<T>>;

/**
 * Protocol sugar: `request(session, "executeAction", …)` with the result typed
 * per action. `Client<NoInfer<CashConnect<T>> | P>` accepts any client that
 * registers `CashConnect<T>`, and `T` is inferred from the session only.
 */
export function executeAction<
	T extends Template,
	A extends ActionName<T>,
	P extends ProtocolDefinition,
>(
	client: Client<NoInfer<CashConnect<T>> | P>,
	session: Session<CashConnect<T>>,
	action: A,
	params: ActionParams<T, A>,
	opts?: RequestOptions,
): Promise<ActionResult<T, A>> {
	return client.request(
		session,
		"executeAction",
		{ action, params },
		opts,
	) as Promise<ActionResult<T, A>>;
}
