/**
 * A template written as a literal, so per-variable literal types survive.
 * Covers every basic variable type, optional params, and `object` and `array`
 * params and returns.
 */
import type { Template } from "@cashconnect-js/core/templates";

// `as const satisfies Template` keeps the literal types. isolatedDeclarations
// rejects it, one reason tests are a separate program.
export const fixtureTemplate = {
	name: "Fixture",
	actions: {
		leaves: {
			params: {
				address: { type: "address", name: "Address" },
				bytes: { type: "bytes", name: "Bytes" },
				enum: { type: "enum", name: "Enum" },
				number: { type: "number", name: "Number" },
				publicKey: { type: "publicKey", name: "Public key" },
				satoshis: { type: "satoshis", name: "Satoshis" },
				signature: { type: "signature", name: "Signature" },
				string: { type: "string", name: "String" },
				transaction: { type: "transaction", name: "Transaction" },
				transactionHash: { type: "transactionHash", name: "Hash" },
			},
			instructions: [],
			returns: {
				number: { type: "number", name: "Number" },
				address: { type: "address", name: "Address" },
				bytes: { type: "bytes", name: "Bytes" },
			},
		},
		optional: {
			params: {
				implicit: { type: "string", name: "Required by default" },
				explicit: { type: "string", name: "Required", required: true },
				optional: { type: "satoshis", name: "Optional", required: false },
			},
			instructions: [],
			returns: {
				maybe: { type: "bytes", name: "Maybe", required: false },
			},
		},
		groups: {
			params: {
				pool: {
					type: "object",
					properties: {
						amount: { type: "satoshis", name: "Amount" },
						recipient: { type: "address", name: "Recipient" },
					},
				},
				outputs: {
					type: "array",
					required: false,
					properties: {
						lockingBytecode: { type: "bytes", name: "Locking bytecode" },
						value: { type: "satoshis", name: "Value" },
					},
				},
			},
			instructions: [],
			returns: {
				receipt: {
					type: "object",
					properties: { memo: { type: "string", name: "Memo" } },
				},
			},
		},
	},
} as const satisfies Template;

export type FixtureTemplate = typeof fixtureTemplate;
