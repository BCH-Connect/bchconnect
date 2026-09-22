/**
 * A twelve-action CashConnect template written as a literal, so per-variable
 * literal types survive. Covers scalar, `object` and `array` params and
 * optional (`required: false`) params.
 */
import type { Template } from "@cashconnect-js/core/templates";

// `as const satisfies Template` keeps the literal types. isolatedDeclarations
// rejects it, one reason tests are a separate program.
export const literalTemplate = {
	name: "Test Exchange Template",
	description: "Twelve-action test template",
	actions: {
		create: {
			params: {
				amount: { type: "number", name: "Amount to mint" },
				payoutLockingBytecode: { type: "address", name: "Payout address" },
				memo: { type: "string", name: "Optional memo", required: false },
			},
			instructions: [],
			returns: {
				categoryId: { type: "transactionHash", name: "Created category id" },
			},
		},
		transfer: {
			params: {
				to: { type: "address", name: "Recipient" },
				amount: { type: "satoshis", name: "Amount" },
			},
			instructions: [],
			returns: { txid: { type: "transactionHash", name: "Transfer txid" } },
		},
		burn: {
			params: {
				categoryId: { type: "transactionHash", name: "Category" },
				amount: { type: "number", name: "Amount to burn" },
			},
			instructions: [],
			returns: { txid: { type: "transactionHash", name: "Burn txid" } },
		},
		swap: {
			params: {
				fromCategory: { type: "transactionHash", name: "From" },
				toCategory: { type: "transactionHash", name: "To" },
				amount: { type: "number", name: "Amount" },
				minReceived: {
					type: "number",
					name: "Slippage floor",
					required: false,
				},
			},
			instructions: [],
			returns: { received: { type: "number", name: "Amount received" } },
		},
		addLiquidity: {
			params: {
				pool: {
					type: "object",
					properties: {
						categoryA: { type: "transactionHash", name: "Category A" },
						categoryB: { type: "transactionHash", name: "Category B" },
					},
				},
				amountA: { type: "number", name: "Amount A" },
				amountB: { type: "number", name: "Amount B" },
			},
			instructions: [],
			returns: { lpTokens: { type: "number", name: "LP tokens minted" } },
		},
		removeLiquidity: {
			params: {
				lpTokens: { type: "number", name: "LP tokens to burn" },
				recipient: { type: "address", name: "Recipient", required: false },
			},
			instructions: [],
			returns: { amountA: { type: "number", name: "A returned" } },
		},
		stake: {
			params: {
				amount: { type: "number", name: "Amount" },
				lockUntil: { type: "number", name: "Lock height" },
			},
			instructions: [],
			returns: { positionId: { type: "bytes", name: "Position id" } },
		},
		unstake: {
			params: { positionId: { type: "bytes", name: "Position id" } },
			instructions: [],
			returns: { amount: { type: "number", name: "Amount returned" } },
		},
		claim: {
			params: {
				positions: {
					type: "array",
					properties: { positionId: { type: "bytes", name: "Position id" } },
				},
			},
			instructions: [],
			returns: { claimed: { type: "number", name: "Total claimed" } },
		},
		vote: {
			params: {
				proposalId: { type: "bytes", name: "Proposal" },
				support: { type: "enum", name: "Support" },
				reason: { type: "string", name: "Reason", required: false },
			},
			instructions: [],
			returns: { weight: { type: "number", name: "Vote weight" } },
		},
		withdraw: {
			params: {
				to: { type: "address", name: "Destination" },
				amount: { type: "satoshis", name: "Amount", required: false },
			},
			instructions: [],
			returns: { txid: { type: "transactionHash", name: "Withdraw txid" } },
		},
		signMemo: {
			params: { memo: { type: "string", name: "Memo to sign" } },
			instructions: [],
			returns: { signature: { type: "signature", name: "Signature" } },
		},
	},
} as const satisfies Template;

export type LiteralTemplate = typeof literalTemplate;
