import type { Transaction } from "@bchconnect/core";

/**
 * Data type a template variable declares.
 *
 * @beta
 */
export type CashConnectVariableType =
	| "address"
	| "bytes"
	| "enum"
	| "number"
	| "publicKey"
	| "satoshis"
	| "signature"
	| "string"
	| "transaction"
	| "transactionHash";

/**
 * A single-value template variable.
 *
 * @beta
 */
export interface CashConnectBasicVariable {
	/** What the value is, which also decides its TypeScript type. */
	readonly type: CashConnectVariableType;
	/** Label the wallet shows for the value. */
	readonly name: string;
	/** Whether the value must be given. Default: `true`. */
	readonly required?: boolean | undefined;
}

/**
 * A template variable grouping basic variables, once (`object`) or repeated
 * (`array`).
 *
 * @beta
 */
export interface CashConnectGroupVariable {
	/** `object` for one record of the properties, `array` for a list of them. */
	readonly type: "object" | "array";
	/** Whether the value must be given. Default: `true`. */
	readonly required?: boolean | undefined;
	/** The grouped variables, by name. Every one of them is required. */
	readonly properties: { readonly [name: string]: CashConnectBasicVariable };
}

/**
 * A param an action takes or a value it returns.
 *
 * @beta
 */
export type CashConnectVariable =
	| CashConnectBasicVariable
	| CashConnectGroupVariable;

/**
 * CashASM text, or CashASM with scripts resolved into it.
 *
 * @beta
 */
export type CashConnectScriptRef =
	| string
	| {
			readonly script: string;
			readonly resolve?: { readonly [name: string]: string } | undefined;
	  };

/**
 * Instruction that evaluates CashASM into named values.
 *
 * @beta
 */
export interface CashConnectResolveInstruction {
	/** Instruction kind. */
	readonly type: "resolve";
	/** CashASM condition; the instruction runs only when it holds. */
	readonly $if?: string | undefined;
	/** The values to compute, by name. */
	readonly payload: { readonly [name: string]: CashConnectScriptRef };
}

/**
 * An input of a transaction instruction.
 *
 * @beta
 */
export interface CashConnectTransactionInput {
	/** CashASM condition; the input is added only when it holds. */
	readonly $if?: string | undefined;
	/** CashASM of the unlocking bytecode. */
	readonly unlockingBytecode?: CashConnectScriptRef | undefined;
	/** CashASM of the spent output's transaction hash. */
	readonly outpointTransactionHash: string;
	/** Index of the spent output, or CashASM evaluating to it. */
	readonly outpointIndex: string | number;
	/** Sequence number, or CashASM evaluating to it. */
	readonly sequenceNumber: string | number;
}

/**
 * An output of a transaction instruction.
 *
 * @beta
 */
export interface CashConnectTransactionOutput {
	/** CashASM condition; the output is added only when it holds. */
	readonly $if?: string | undefined;
	/** CashASM of the locking bytecode. */
	readonly lockingBytecode?: CashConnectScriptRef | undefined;
	/** Value in satoshis, or CashASM evaluating to it. */
	readonly valueSatoshis: string | bigint;
	/** CashTokens the output carries. */
	readonly token?:
		| {
				readonly category: string | Uint8Array;
				readonly amount?: string | bigint | undefined;
				readonly nft?:
					| {
							readonly capability: "none" | "mutable" | "minting";
							readonly commitment: string | Uint8Array;
					  }
					| undefined;
		  }
		| undefined;
}

/**
 * Instruction that builds and signs a transaction from the wallet's coins.
 * `"*"` lets the wallet add inputs or change.
 *
 * @beta
 */
export interface CashConnectTransactionInstruction {
	/** Instruction kind. */
	readonly type: "transaction";
	/** CashASM condition; the instruction runs only when it holds. */
	readonly $if?: string | undefined;
	/** The transaction to build. */
	readonly payload: {
		readonly name: string;
		readonly version: number;
		readonly locktime: string | number;
		readonly inputs: readonly (CashConnectTransactionInput | "*")[];
		readonly outputs: readonly (CashConnectTransactionOutput | "*")[];
		readonly validate?: boolean | undefined;
	};
}

/**
 * One step of an action.
 *
 * @beta
 */
export type CashConnectInstruction =
	| CashConnectResolveInstruction
	| CashConnectTransactionInstruction;

/**
 * An action: params in, instructions run by the wallet, values out.
 *
 * @beta
 */
export interface CashConnectAction {
	/** Title and description the wallet shows when it asks for approval. */
	readonly meta?:
		| { readonly title: string; readonly description: string }
		| undefined;
	/** The values the dapp passes, by name. */
	readonly params: { readonly [name: string]: CashConnectVariable };
	/** The steps the wallet runs, in order. */
	readonly instructions: readonly CashConnectInstruction[];
	/** The values the wallet returns, by name. */
	readonly returns: { readonly [name: string]: CashConnectVariable };
}

/**
 * Fields every template script has.
 *
 * @beta
 */
export interface CashConnectScriptBase {
	/** Display name. */
	readonly name?: string | undefined;
	/** Display description. */
	readonly description?: string | undefined;
	/** CashASM source. */
	readonly script: string;
	/** Debugging information emitted by a compiler. */
	readonly debug?:
		| {
				readonly name: string;
				readonly source: string;
				readonly sourceMap: string;
				readonly requires?:
					| readonly {
							readonly ip: number;
							readonly line: number;
							readonly message?: string | undefined;
					  }[]
					| undefined;
		  }
		| undefined;
}

/**
 * A script a template's CashASM can reference: plain, locking, or unlocking.
 *
 * @beta
 */
export type CashConnectScript =
	| CashConnectScriptBase
	| (CashConnectScriptBase & { readonly lockingType: string })
	| (CashConnectScriptBase & { readonly unlocks: string });

/**
 * A CashConnect template. A template typed by the SDK is accepted as is.
 *
 * @beta
 */
export interface CashConnectTemplate {
	/** Name the wallet shows when it asks to pair. */
	readonly name: string;
	/** Description the wallet shows when it asks to pair. */
	readonly description?: string | undefined;
	/** The actions a session can run, by name. */
	readonly actions: { readonly [name: string]: CashConnectAction };
	/** Scripts the actions' CashASM can reference, by name. */
	readonly scripts?: { readonly [name: string]: CashConnectScript } | undefined;
	/** Identifiers of the features the template relies on. */
	readonly supported?: readonly string[] | undefined;
}

/**
 * Names of a template's actions.
 *
 * @beta
 */
export type CashConnectActionName<T extends CashConnectTemplate> =
	keyof T["actions"] & string;

/**
 * The TypeScript type of one basic variable's value: `bigint` for `satoshis`
 * and `number`, `string` for `string` and `address` (a CashAddr), and
 * `Uint8Array` for every other type.
 *
 * @beta
 */
export type CashConnectLeafValue<V> = V extends { readonly type: infer K }
	? K extends "satoshis" | "number"
		? bigint
		: K extends "string" | "address"
			? string
			: Uint8Array
	: never;

/**
 * The TypeScript type of one variable's value.
 *
 * @beta
 */
export type CashConnectValue<V> = V extends {
	readonly type: infer K;
	readonly properties: infer P;
}
	? K extends "array"
		? readonly { readonly [N in keyof P]: CashConnectLeafValue<P[N]> }[]
		: { readonly [N in keyof P]: CashConnectLeafValue<P[N]> }
	: CashConnectLeafValue<V>;

/**
 * Values of a variable record; `required: false` makes a key optional.
 *
 * @beta
 */
export type CashConnectValues<R> = {
	readonly [K in keyof R as R[K] extends { readonly required: false }
		? never
		: K]: CashConnectValue<R[K]>;
} & {
	readonly [K in keyof R as R[K] extends { readonly required: false }
		? K
		: never]?: CashConnectValue<R[K]>;
} extends infer V
	? { [K in keyof V]: V[K] }
	: never;

/**
 * Params of one action.
 *
 * @beta
 */
export type CashConnectActionParams<
	T extends CashConnectTemplate,
	A extends CashConnectActionName<T>,
> = CashConnectValues<T["actions"][A]["params"]>;

/**
 * Returned values of one action.
 *
 * @beta
 */
export type CashConnectActionReturns<
	T extends CashConnectTemplate,
	A extends CashConnectActionName<T>,
> = CashConnectValues<T["actions"][A]["returns"]>;

/**
 * What one action resolves with.
 *
 * @beta
 */
export interface CashConnectActionResult<
	T extends CashConnectTemplate,
	A extends CashConnectActionName<T>,
> {
	/** The action's returned values, decoded by their declared types. */
	readonly data: CashConnectActionReturns<T, A>;
	/** The transactions the wallet built and signed, not broadcast. */
	readonly transactions: readonly Transaction[];
	/** Net change of the session's balances if the transactions confirm: `sats` and category keys, non-zero entries only. */
	readonly balanceChanges: Readonly<Record<string, bigint>>;
}

/**
 * `executeAction` params: a union discriminated by action name.
 *
 * @beta
 */
export type CashConnectExecuteActionParams<T extends CashConnectTemplate> = {
	[A in CashConnectActionName<T>]: {
		readonly action: A;
		readonly params: CashConnectActionParams<T, A>;
	};
}[CashConnectActionName<T>];

/**
 * `executeAction` result over every action; the sugar narrows it to one.
 *
 * @beta
 */
export type CashConnectExecuteActionResult<T extends CashConnectTemplate> = {
	[A in CashConnectActionName<T>]: CashConnectActionResult<T, A>;
}[CashConnectActionName<T>];
