import { ConfigError, InvalidWalletResponseError } from "@bchconnect/core";
import type { SdkPrimitives, SdkWireValue, SdkWireValues } from "./sdk.js";
import type {
	CashConnectAction,
	CashConnectTemplate,
	CashConnectVariable,
	CashConnectVariableType,
} from "./template.js";
import type { CashConnectChain } from "./types.js";

const MAX_SATOSHIS = 2_100_000_000_000_000n;

/**
 * What the codec reads from a session: its template, its chain and its id.
 *
 * @internal
 */
export interface CodecSession {
	readonly id: string;
	readonly data: {
		readonly template: CashConnectTemplate;
		readonly chain: CashConnectChain;
	};
}

/**
 * One decoded value: a leaf, or groups of leaves.
 *
 * @internal
 */
export type DecodedValue =
	| bigint
	| string
	| Uint8Array
	| DecodedValues
	| readonly DecodedValues[];

/**
 * Decoded returns of an action, by name.
 *
 * @internal
 */
export interface DecodedValues {
	readonly [name: string]: DecodedValue;
}

type Variables = { readonly [name: string]: CashConnectVariable };

interface Scope {
	readonly sdk: SdkPrimitives;
	readonly chain: CashConnectChain;
	readonly action: string;
	readonly sessionId: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		!(value instanceof Uint8Array)
	);
}

function toPath(prefix: string, name: string): string {
	return prefix === "" ? name : `${prefix}.${name}`;
}

function getOwn(values: Readonly<Record<string, unknown>>, name: string) {
	return Object.hasOwn(values, name) ? values[name] : undefined;
}

function findAction(
	template: CashConnectTemplate,
	scope: Scope,
): CashConnectAction {
	const action = Object.hasOwn(template.actions, scope.action)
		? template.actions[scope.action]
		: undefined;
	if (action === undefined) {
		throw new ConfigError(`The template has no action "${scope.action}"`, {
			sessionId: scope.sessionId,
		});
	}
	return action;
}

function toScope(sdk: SdkPrimitives, session: CodecSession, action: string) {
	return { sdk, chain: session.data.chain, action, sessionId: session.id };
}

function toParamError(scope: Scope, message: string, cause?: unknown) {
	return new ConfigError(message, {
		sessionId: scope.sessionId,
		...(cause === undefined ? {} : { cause }),
	});
}

function toTypeError(scope: Scope, path: string, expected: string) {
	return toParamError(
		scope,
		`Param "${path}" of action "${scope.action}" must be ${expected}`,
	);
}

function toLockingBytecode(
	scope: Scope,
	address: string,
	path: string,
): Uint8Array {
	const error = (cause?: unknown) =>
		toParamError(
			scope,
			`Param "${path}" of action "${scope.action}" is not a CashAddr for ${scope.chain}`,
			cause,
		);
	const separator = address.indexOf(":");
	const prefix =
		separator === -1 ? undefined : address.slice(0, separator).toLowerCase();
	if (prefix !== undefined && prefix !== scope.chain) throw error();

	// The SDK joins each prefix it tries to the address, so a prefixed address
	// is decoded with an empty one.
	try {
		return scope.sdk.Address.fromCashAddr(address, false, [
			prefix === undefined ? scope.chain : "",
		]).toLockscriptBytes();
	} catch (cause) {
		throw error(cause);
	}
}

function toWireLeaf(
	scope: Scope,
	type: CashConnectVariableType,
	value: unknown,
	path: string,
): Uint8Array {
	switch (type) {
		case "satoshis":
		case "number": {
			if (typeof value !== "bigint") throw toTypeError(scope, path, "a bigint");
			if (type === "satoshis" && (value < 0n || value > MAX_SATOSHIS)) {
				throw toParamError(
					scope,
					`Param "${path}" of action "${scope.action}" is outside 0 to 21 million BCH`,
				);
			}
			return scope.sdk.Bytes.fromBigInt(value).toUint8Array();
		}
		case "string":
		case "address": {
			if (typeof value !== "string") throw toTypeError(scope, path, "a string");
			return type === "string"
				? scope.sdk.Bytes.fromUTF8(value).toUint8Array()
				: toLockingBytecode(scope, value, path);
		}
		default: {
			if (!(value instanceof Uint8Array)) {
				throw toTypeError(scope, path, "a Uint8Array");
			}
			return value;
		}
	}
}

function toWireValue(
	scope: Scope,
	variable: CashConnectVariable,
	value: unknown,
	path: string,
): SdkWireValue {
	switch (variable.type) {
		case "object": {
			if (!isRecord(value)) throw toTypeError(scope, path, "an object");
			return toWireValues(scope, variable.properties, value, path);
		}
		case "array": {
			if (!Array.isArray(value)) throw toTypeError(scope, path, "an array");
			return value.map((item: unknown, index) => {
				const itemPath = `${path}[${index}]`;
				if (!isRecord(item)) throw toTypeError(scope, itemPath, "an object");
				return toWireValues(scope, variable.properties, item, itemPath);
			});
		}
		default:
			return toWireLeaf(scope, variable.type, value, path);
	}
}

function toWireValues(
	scope: Scope,
	variables: Variables,
	values: Readonly<Record<string, unknown>>,
	prefix: string,
): SdkWireValues {
	for (const name of Object.keys(values)) {
		if (!Object.hasOwn(variables, name)) {
			throw toParamError(
				scope,
				`Action "${scope.action}" has no param "${toPath(prefix, name)}"`,
			);
		}
	}

	const wire: Record<string, SdkWireValue> = {};
	for (const [name, variable] of Object.entries(variables)) {
		const path = toPath(prefix, name);
		const value = getOwn(values, name);
		if (value === undefined) {
			if (variable.required === false) continue;
			throw toParamError(
				scope,
				`Action "${scope.action}" is missing param "${path}"`,
			);
		}
		wire[name] = toWireValue(scope, variable, value, path);
	}
	return wire;
}

/**
 * Encodes an action's params for the wallet, each value by the type its
 * template variable declares, with the SDK's own primitives. A param the
 * action does not take, or cannot take as given, throws `ConfigError`
 * naming the action and the param, never the value. The params are not
 * changed.
 *
 * @internal
 */
export function toWireParams(
	sdk: SdkPrimitives,
	session: CodecSession,
	action: string,
	params: unknown,
): SdkWireValues {
	const scope = toScope(sdk, session, action);
	const { params: variables } = findAction(session.data.template, scope);
	if (!isRecord(params)) {
		throw toParamError(
			scope,
			`Action "${action}" takes its params as an object`,
		);
	}
	return toWireValues(scope, variables, params, "");
}

function toMalformedError(scope: Scope, path: string, cause?: unknown) {
	return new InvalidWalletResponseError(
		`The wallet returned a malformed "${path}" for action "${scope.action}"`,
		{ sessionId: scope.sessionId, ...(cause === undefined ? {} : { cause }) },
	);
}

function fromWireLeaf(
	scope: Scope,
	type: CashConnectVariableType,
	value: unknown,
	path: string,
): DecodedValue {
	if (!(value instanceof Uint8Array)) throw toMalformedError(scope, path);
	try {
		switch (type) {
			case "satoshis":
			case "number":
				return scope.sdk.Bytes.from(value).toBigInt();
			case "string":
				return scope.sdk.Bytes.from(value).toUtf8();
			case "address":
				return scope.sdk.Address.fromLockscriptBytes(value).toCashAddr(
					scope.chain,
				);
			default:
				return value;
		}
	} catch (cause) {
		throw toMalformedError(scope, path, cause);
	}
}

function fromWireValue(
	scope: Scope,
	variable: CashConnectVariable,
	value: unknown,
	path: string,
): DecodedValue {
	switch (variable.type) {
		case "object": {
			if (!isRecord(value)) throw toMalformedError(scope, path);
			return fromWireValues(scope, variable.properties, value, path);
		}
		case "array": {
			if (!Array.isArray(value)) throw toMalformedError(scope, path);
			return value.map((item: unknown, index) => {
				const itemPath = `${path}[${index}]`;
				if (!isRecord(item)) throw toMalformedError(scope, itemPath);
				return fromWireValues(scope, variable.properties, item, itemPath);
			});
		}
		default:
			return fromWireLeaf(scope, variable.type, value, path);
	}
}

function fromWireValues(
	scope: Scope,
	variables: Variables,
	data: Readonly<Record<string, unknown>>,
	prefix: string,
): DecodedValues {
	const decoded: Record<string, DecodedValue> = {};
	for (const [name, variable] of Object.entries(variables)) {
		const path = toPath(prefix, name);
		const value = getOwn(data, name);
		if (value === undefined) {
			if (variable.required === false) continue;
			throw new InvalidWalletResponseError(
				`The wallet returned no "${path}" for action "${scope.action}"`,
				{ sessionId: scope.sessionId },
			);
		}
		decoded[name] = fromWireValue(scope, variable, value, path);
	}
	return decoded;
}

/**
 * Decodes the values an action returned, each by the type its template
 * variable declares, with the SDK's own primitives. Values the action does
 * not declare are left out. A value that is missing or does not decode
 * throws `InvalidWalletResponseError`.
 *
 * @internal
 */
export function fromWireReturns(
	sdk: SdkPrimitives,
	session: CodecSession,
	action: string,
	data: unknown,
): DecodedValues {
	const scope = toScope(sdk, session, action);
	const { returns: variables } = findAction(session.data.template, scope);
	if (!isRecord(data)) {
		throw new InvalidWalletResponseError(
			`The wallet returned malformed data for action "${action}"`,
			{ sessionId: session.id },
		);
	}
	return fromWireValues(scope, variables, data, "");
}
