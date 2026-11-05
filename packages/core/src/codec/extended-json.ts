// JSON has no bigint or byte type, so these values are serialized as tagged strings:
//   10000n                   → "<bigint: 10000n>"
//   Uint8Array [0xab, 0xcd]  → "<Uint8Array: 0xabcd>"

/** A bigint tag with at least one digit */
const BIGINT_TAG_REGEX = /^<bigint: (?<digits>[0-9]+)n>$/;
/** A bytes tag with even-length lowercase hex */
const BYTES_TAG_REGEX = /^<Uint8Array: 0x(?<hex>(?:[0-9a-f]{2})*)>$/;

/**
 * Serializes a value to JSON, writing each `bigint` as `"<bigint: 10000n>"`
 * and each `Uint8Array` as `"<Uint8Array: 0xabcd>"`. For JSON values, bigints
 * and `Uint8Array`s, the output matches libauth's `stringify` without
 * spacing, the format Bitcoin Cash wallets read in WalletConnect requests.
 *
 * @remarks
 * Everything else follows `JSON.stringify`: functions, symbols and
 * `undefined` are left out of objects, and a value with a `toJSON` method,
 * such as a Node.js `Buffer`, is serialized through it. A global
 * `BigInt.prototype.toJSON` runs first, so bigints are then written by it,
 * not tagged.
 *
 * @param value - The value to serialize.
 * @returns The JSON text.
 * @throws `TypeError` when `value` itself has no JSON form (`undefined`, a
 * function or a symbol), or when it contains a circular reference.
 *
 * @example
 * ```ts
 * stringifyExtendedJson({ valueSatoshis: 10000n, lockingBytecode: Uint8Array.of(0x76, 0xa9) });
 * // '{"valueSatoshis":"<bigint: 10000n>","lockingBytecode":"<Uint8Array: 0x76a9>"}'
 * ```
 *
 * @public
 */
export function stringifyExtendedJson(value: unknown): string {
	// The lib types JSON.stringify as string, but it returns undefined here.
	const text: string | undefined = JSON.stringify(
		value,
		(_key, item: unknown) => {
			if (typeof item === "bigint") return `<bigint: ${item}n>`;
			if (isBytes(item)) {
				const pairs = Array.from(item, (byte) =>
					byte.toString(16).padStart(2, "0"),
				);
				return `<Uint8Array: 0x${pairs.join("")}>`;
			}
			return item;
		},
	);
	if (text === undefined) {
		throw new TypeError("The value has no JSON representation");
	}

	return text;
}

/**
 * Parses JSON text, reading each string `"<bigint: 10000n>"` as a `bigint`
 * and each string `"<Uint8Array: 0xabcd>"` as a `Uint8Array`.
 *
 * @remarks
 * Only non-negative bigints with at least one digit, and bytes as
 * even-length lowercase hex, are read. Any other string, including other
 * tags, stays a string.
 *
 * @param text - The JSON text to parse.
 * @returns The parsed value.
 * @throws `SyntaxError` when `text` is not valid JSON.
 *
 * @example
 * ```ts
 * parseExtendedJson('{"valueSatoshis":"<bigint: 10000n>","lockingBytecode":"<Uint8Array: 0x76a9>"}');
 * // { valueSatoshis: 10000n, lockingBytecode: Uint8Array [0x76, 0xa9] }
 * ```
 *
 * @public
 */
export function parseExtendedJson(text: string): unknown {
	return JSON.parse(text, (_key, item: unknown) => {
		if (typeof item !== "string") return item;

		const { digits } = item.match(BIGINT_TAG_REGEX)?.groups ?? {};
		if (digits !== undefined) return BigInt(digits);

		const { hex } = item.match(BYTES_TAG_REGEX)?.groups ?? {};
		if (hex !== undefined) {
			const pairs = hex.match(/../g) ?? [];
			return Uint8Array.from(pairs, (pair) => Number.parseInt(pair, 16));
		}
		return item;
	});
}

function isBytes(value: unknown): value is Uint8Array {
	return (
		ArrayBuffer.isView(value) &&
		Object.prototype.toString.call(value) === "[object Uint8Array]"
	);
}
