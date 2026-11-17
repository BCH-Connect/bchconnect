/**
 * CashConnect connector for BCH Connect. Runs a dapp's template actions in
 * the wallet over Nostr through the CashConnect SDK.
 *
 * @packageDocumentation
 */

export { cashConnect } from "./connector.js";
export { executeAction } from "./execute-action.js";
export type {
	CashConnectAction,
	CashConnectActionName,
	CashConnectActionParams,
	CashConnectActionResult,
	CashConnectActionReturns,
	CashConnectBasicVariable,
	CashConnectExecuteActionParams,
	CashConnectExecuteActionResult,
	CashConnectGroupVariable,
	CashConnectInstruction,
	CashConnectLeafValue,
	CashConnectResolveInstruction,
	CashConnectScript,
	CashConnectScriptBase,
	CashConnectScriptRef,
	CashConnectTemplate,
	CashConnectTransactionInput,
	CashConnectTransactionInstruction,
	CashConnectTransactionOutput,
	CashConnectValue,
	CashConnectValues,
	CashConnectVariable,
	CashConnectVariableType,
} from "./template.js";
export {
	type SendTemplate,
	type SendTokensTemplate,
	sendTemplate,
	sendTokensTemplate,
} from "./templates.js";
export type {
	CashConnect,
	CashConnectBalances,
	CashConnectChain,
	CashConnectConfig,
	CashConnectSessionData,
} from "./types.js";
