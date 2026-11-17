import type {
	NonFungibleTokenCapability,
	Transaction,
	TransactionInput,
	TransactionOutput,
} from "@bchconnect/core";
import { chains } from "./chains.js";
import type { CashConnectBalances, CashConnectChain } from "./types.js";

const HEX = /^[0-9a-f]*$/i;

const CAPABILITIES: readonly NonFungibleTokenCapability[] = [
	"none",
	"mutable",
	"minting",
];

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Whether `value` is a hex string of exactly `length` characters.
 *
 * @internal
 */
export function isHex(value: unknown, length: number): value is string {
	return (
		typeof value === "string" && value.length === length && HEX.test(value)
	);
}

/**
 * Whether `value` is an array holding only strings.
 *
 * @internal
 */
export function isStringList(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

/**
 * Whether `value` is an integer, zero or above.
 *
 * @internal
 */
export function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Whether `value` is one of the chains a session can run on.
 *
 * @internal
 */
export function isChain(value: unknown): value is CashConnectChain {
	return Object.values(chains).some((chain) => chain === value);
}

/**
 * Whether `value` is a record of balance changes: `bigint` values by key.
 *
 * @internal
 */
export function isBalanceChanges(
	value: unknown,
): value is Readonly<Record<string, bigint>> {
	return (
		isObject(value) &&
		!Array.isArray(value) &&
		Object.values(value).every((amount) => typeof amount === "bigint")
	);
}

/**
 * Whether `value` is a session's balances: `bigint` values, `sats` among them.
 *
 * @internal
 */
export function isBalances(value: unknown): value is CashConnectBalances {
	if (!isBalanceChanges(value)) return false;
	const { sats } = value;
	return typeof sats === "bigint";
}

function isToken(value: unknown): boolean {
	if (!isObject(value)) return false;
	const { amount, category, nft } = value;
	if (nft !== undefined) {
		if (!isObject(nft)) return false;
		const { capability, commitment } = nft;
		if (
			!CAPABILITIES.some((known) => known === capability) ||
			!(commitment instanceof Uint8Array)
		) {
			return false;
		}
	}
	return typeof amount === "bigint" && category instanceof Uint8Array;
}

/**
 * Whether `value` is a decoded transaction output. Fields beyond core's
 * `TransactionOutput` are ignored.
 *
 * @internal
 */
export function isTransactionOutput(
	value: unknown,
): value is TransactionOutput {
	if (!isObject(value)) return false;
	const { lockingBytecode, valueSatoshis, token } = value;
	return (
		lockingBytecode instanceof Uint8Array &&
		typeof valueSatoshis === "bigint" &&
		(token === undefined || isToken(token))
	);
}

function isTransactionInput(value: unknown): value is TransactionInput {
	if (!isObject(value)) return false;
	const {
		outpointIndex,
		sequenceNumber,
		outpointTransactionHash,
		unlockingBytecode,
	} = value;
	return (
		typeof outpointIndex === "number" &&
		typeof sequenceNumber === "number" &&
		outpointTransactionHash instanceof Uint8Array &&
		unlockingBytecode instanceof Uint8Array
	);
}

/**
 * Whether `value` is a decoded transaction. Fields beyond core's
 * `Transaction` are ignored.
 *
 * @internal
 */
export function isTransaction(value: unknown): value is Transaction {
	if (!isObject(value)) return false;
	const { version, locktime, inputs, outputs } = value;
	return (
		Number.isInteger(version) &&
		Number.isInteger(locktime) &&
		Array.isArray(inputs) &&
		inputs.every(isTransactionInput) &&
		Array.isArray(outputs) &&
		outputs.every(isTransactionOutput)
	);
}
