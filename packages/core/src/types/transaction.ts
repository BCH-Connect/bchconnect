/**
 * A transaction input.
 *
 * @public
 */
export interface TransactionInput {
	/** Index of the spent output within the previous transaction. */
	readonly outpointIndex: number;
	/** Hash of the previous transaction, which holds the spent output. */
	readonly outpointTransactionHash: Uint8Array;
	/** Sequence number. */
	readonly sequenceNumber: number;
	/** Unlocking bytecode. */
	readonly unlockingBytecode: Uint8Array;
}

/**
 * Capability of a non-fungible token.
 *
 * @public
 */
export type NonFungibleTokenCapability = "none" | "mutable" | "minting";

/**
 * CashToken data carried by an output.
 *
 * @public
 */
export interface TokenData {
	/** Fungible token amount. */
	readonly amount: bigint;
	/** Token category id. */
	readonly category: Uint8Array;
	/** Non-fungible token, when present. */
	readonly nft?: {
		readonly capability: NonFungibleTokenCapability;
		readonly commitment: Uint8Array;
	};
}

/**
 * A transaction output.
 *
 * @public
 */
export interface TransactionOutput {
	/** Locking bytecode. */
	readonly lockingBytecode: Uint8Array;
	/** CashToken data, when present. */
	readonly token?: TokenData;
	/** Value in satoshis. */
	readonly valueSatoshis: bigint;
}

/**
 * A decoded transaction.
 *
 * @public
 */
export interface Transaction {
	/** Inputs, each spending one previous output. */
	readonly inputs: readonly TransactionInput[];
	/** Earliest block height or time at which the transaction is valid. */
	readonly locktime: number;
	/** Outputs created by the transaction. */
	readonly outputs: readonly TransactionOutput[];
	/** Transaction format version. */
	readonly version: number;
}

/**
 * A named, typed parameter in a contract ABI.
 *
 * @public
 */
export interface AbiInput {
	/** Parameter name. */
	readonly name: string;
	/** Parameter type. */
	readonly type: string;
}

/**
 * A contract ABI function.
 *
 * @public
 */
export interface AbiFunction {
	/** Function name. */
	readonly name: string;
	/** Function parameters. */
	readonly inputs: readonly AbiInput[];
}

/**
 * A compiled contract artifact.
 *
 * @public
 */
export interface ContractArtifact {
	/** Contract name. */
	readonly contractName: string;
	/** Constructor parameters. */
	readonly constructorInputs: readonly AbiInput[];
	/** ABI functions. */
	readonly abi: readonly AbiFunction[];
	/** Compiled bytecode. */
	readonly bytecode: string;
	/** Contract source. */
	readonly source: string;
	/** Compiler that produced the artifact. */
	readonly compiler: {
		readonly name: string;
		readonly version: string;
	};
	/** Last update timestamp. */
	readonly updatedAt: string;
}

/**
 * What a wallet needs to display a contract input it is asked to sign.
 *
 * @public
 */
export interface ContractDisplay {
	/** The function being called. */
	readonly abiFunction: AbiFunction;
	/** Redeem script. */
	readonly redeemScript: Uint8Array;
	/** The contract artifact, possibly partial. */
	readonly artifact: Partial<ContractArtifact>;
}

/**
 * An output being spent, with its outpoint and optional contract display data.
 *
 * @public
 */
export interface SourceOutput extends TransactionInput, TransactionOutput {
	/** Contract display data, when the output is locked by a contract. */
	readonly contract?: ContractDisplay;
}

/**
 * Request to sign a transaction.
 *
 * @public
 */
export interface SignTransactionRequest {
	/** A decoded transaction or its hex encoding. */
	readonly transaction: Transaction | string;
	/** The outputs spent by each input, in input order. */
	readonly sourceOutputs: readonly SourceOutput[];
	/** Whether the wallet should broadcast after signing. */
	readonly broadcast?: boolean;
	/** Text the wallet shows the user. */
	readonly userPrompt?: string;
}

/**
 * Result of signing a transaction.
 *
 * @public
 */
export interface SignTransactionResponse {
	/** Signed transaction, hex-encoded. */
	readonly signedTransaction: string;
	/** Hash of the signed transaction, hex-encoded. */
	readonly signedTransactionHash: string;
}

/**
 * Request to sign a message.
 *
 * @public
 */
export interface SignMessageRequest {
	/** The message to sign. */
	readonly message: string;
	/** Text the wallet shows the user. */
	readonly userPrompt?: string;
}

/**
 * Result of signing a message: the signature.
 *
 * @public
 */
export type SignMessageResponse = string;
