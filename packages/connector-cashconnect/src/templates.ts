/**
 * Type of {@link sendTemplate}: one `send` action that takes a recipient
 * address and an amount in satoshis, and returns the signed transaction and
 * its hash.
 *
 * @beta
 */
export interface SendTemplate {
	/** The template's name, which the wallet shows. */
	readonly name: "BCH Connect send";
	/** What the template does, which the wallet shows. */
	readonly description: "Sends satoshis from the wallet to one address.";
	/** The template's one action. */
	readonly actions: {
		readonly send: {
			readonly meta: {
				readonly title: "Send";
				readonly description: "Send {{ <amount> | satoshis }} to {{ <recipient> | address }}";
			};
			readonly params: {
				readonly recipient: {
					readonly name: "Recipient";
					readonly type: "address";
				};
				readonly amount: {
					readonly name: "Amount (satoshis)";
					readonly type: "satoshis";
				};
			};
			readonly instructions: readonly [
				{
					readonly type: "transaction";
					readonly payload: {
						readonly name: "tx";
						readonly version: 2;
						readonly locktime: 0;
						readonly inputs: readonly ["*"];
						readonly outputs: readonly [
							{
								readonly lockingBytecode: "<recipient>";
								readonly valueSatoshis: "<amount>";
							},
							"*",
						];
					};
				},
			];
			readonly returns: {
				readonly tx: {
					readonly name: "Signed transaction";
					readonly type: "transaction";
				};
				readonly txHash: {
					readonly name: "Transaction hash";
					readonly type: "transactionHash";
				};
			};
		};
	};
}

/**
 * A template with one `send` action, which pays `amount` satoshis from the
 * wallet to `recipient` and returns the signed transaction (`tx`) and its
 * hash (`txHash`, in the byte order explorers show). The wallet picks the
 * inputs and adds change. It signs and never broadcasts: broadcast `tx`
 * yourself.
 *
 * @example
 * ```ts
 * import { createClient } from "@bchconnect/core";
 * import { cashConnect, sendTemplate } from "@bchconnect/connector-cashconnect";
 *
 * const client = createClient({
 *   connectors: [cashConnect({ template: sendTemplate })],
 *   network: "chipnet",
 *   appMetadata: { name: "My dapp", url: "https://dapp.example" },
 * });
 * ```
 *
 * @beta
 */
export const sendTemplate: SendTemplate = {
	name: "BCH Connect send",
	description: "Sends satoshis from the wallet to one address.",
	actions: {
		send: {
			meta: {
				title: "Send",
				description:
					"Send {{ <amount> | satoshis }} to {{ <recipient> | address }}",
			},
			params: {
				recipient: { name: "Recipient", type: "address" },
				amount: { name: "Amount (satoshis)", type: "satoshis" },
			},
			instructions: [
				{
					type: "transaction",
					payload: {
						name: "tx",
						version: 2,
						locktime: 0,
						inputs: ["*"],
						outputs: [
							{ lockingBytecode: "<recipient>", valueSatoshis: "<amount>" },
							"*",
						],
					},
				},
			],
			returns: {
				tx: { name: "Signed transaction", type: "transaction" },
				txHash: { name: "Transaction hash", type: "transactionHash" },
			},
		},
	},
};

/**
 * Type of {@link sendTokensTemplate}: one `sendTokens` action that takes a
 * recipient address, a token category and an amount, and returns the signed
 * transaction and its hash.
 *
 * @beta
 */
export interface SendTokensTemplate {
	/** The template's name, which the wallet shows. */
	readonly name: "BCH Connect send tokens";
	/** What the template does, which the wallet shows. */
	readonly description: "Sends fungible CashTokens from the wallet to one address.";
	/** The template's one action. */
	readonly actions: {
		readonly sendTokens: {
			readonly meta: {
				readonly title: "Send tokens";
				readonly description: "Send {{ <amount> | integer }} tokens of category {{ <category> | bytes }} to {{ <recipient> | address }}";
			};
			readonly params: {
				readonly recipient: {
					readonly name: "Recipient";
					readonly type: "address";
				};
				readonly category: {
					readonly name: "Token category";
					readonly type: "bytes";
				};
				readonly amount: {
					readonly name: "Token amount";
					readonly type: "number";
				};
			};
			readonly instructions: readonly [
				{
					readonly type: "transaction";
					readonly payload: {
						readonly name: "tx";
						readonly version: 2;
						readonly locktime: 0;
						readonly inputs: readonly ["*"];
						readonly outputs: readonly [
							{
								readonly lockingBytecode: "<recipient>";
								readonly valueSatoshis: "<1000>";
								readonly token: {
									readonly category: "<category>";
									readonly amount: "<amount>";
								};
							},
							"*",
						];
					};
				},
			];
			readonly returns: {
				readonly tx: {
					readonly name: "Signed transaction";
					readonly type: "transaction";
				};
				readonly txHash: {
					readonly name: "Transaction hash";
					readonly type: "transactionHash";
				};
			};
		};
	};
}

/**
 * A template with one `sendTokens` action, which pays `amount` fungible
 * tokens of `category` to `recipient` in an output of 1000 satoshis, and
 * returns the signed transaction (`tx`) and its hash (`txHash`). The wallet
 * picks the inputs and adds change. It signs and never broadcasts: broadcast
 * `tx` yourself.
 *
 * `category` is the 32-byte category id in the byte order explorers show, and
 * must be one of the session's `allowedTokens`: the wallet does not spend
 * tokens of other categories. `amount` must be positive. When the whole
 * balance of a category is sent, the decoded transaction keeps a change
 * output with a token amount of zero that `tx` does not encode. The wallet
 * may spend an output of the category that also holds an NFT, and its change
 * does not carry the NFT on.
 *
 * @example
 * ```ts
 * import { executeAction } from "@bchconnect/connector-cashconnect";
 *
 * const { data } = await executeAction(client, session, "sendTokens", {
 *   recipient: "bchtest:qr…",
 *   category: categoryId,
 *   amount: 100n,
 * });
 * ```
 *
 * @beta
 */
export const sendTokensTemplate: SendTokensTemplate = {
	name: "BCH Connect send tokens",
	description: "Sends fungible CashTokens from the wallet to one address.",
	actions: {
		sendTokens: {
			meta: {
				title: "Send tokens",
				description:
					"Send {{ <amount> | integer }} tokens of category {{ <category> | bytes }} to {{ <recipient> | address }}",
			},
			params: {
				recipient: { name: "Recipient", type: "address" },
				category: { name: "Token category", type: "bytes" },
				amount: { name: "Token amount", type: "number" },
			},
			instructions: [
				{
					type: "transaction",
					payload: {
						name: "tx",
						version: 2,
						locktime: 0,
						inputs: ["*"],
						outputs: [
							{
								lockingBytecode: "<recipient>",
								valueSatoshis: "<1000>",
								token: { category: "<category>", amount: "<amount>" },
							},
							"*",
						],
					},
				},
			],
			returns: {
				tx: { name: "Signed transaction", type: "transaction" },
				txHash: { name: "Transaction hash", type: "transactionHash" },
			},
		},
	},
};
