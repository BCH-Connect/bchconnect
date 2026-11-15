import type { MethodName, MethodResult } from "@bchconnect/core";
import type { WalletConnect, WalletConnectStandardMethods } from "./types.js";

const HEX = /^(?:[0-9a-f]{2})+$/i;

/**
 * Whether `value` is a string with at least one character.
 *
 * @internal
 */
export function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
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

function isHex(value: unknown): boolean {
	return typeof value === "string" && HEX.test(value);
}

const guards: {
	readonly [M in keyof WalletConnectStandardMethods]: (
		value: unknown,
	) => boolean;
} = {
	// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
	bch_getAddresses: (value) =>
		Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString),
	// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
	bch_signTransaction: (value) =>
		typeof value === "object" &&
		value !== null &&
		"signedTransaction" in value &&
		isHex(value.signedTransaction) &&
		"signedTransactionHash" in value &&
		isHex(value.signedTransactionHash),
	// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
	bch_signMessage: isNonEmptyString,
};

function isStandard(
	method: string,
): method is keyof WalletConnectStandardMethods {
	return Object.hasOwn(guards, method);
}

/**
 * Whether `value` is a well-formed wallet answer to `method`. The answer to
 * a custom method is not checked: its shape is the dapp's to verify.
 *
 * @internal
 */
export function isValidResult<M extends MethodName<WalletConnect>>(
	method: M,
	value: unknown,
): value is MethodResult<WalletConnect, M> {
	return !isStandard(method) || guards[method](value);
}
