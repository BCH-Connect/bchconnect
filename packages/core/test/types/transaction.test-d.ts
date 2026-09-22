import type {
	WcSignTransactionRequest as WcRequest16,
	WcSignTransactionResponse as WcResponse16,
	WcSourceOutput as WcSourceOutput16,
} from "@bch-wc2/interfaces";
import type {
	Input as InputNext,
	Output as OutputNext,
	TransactionCommon as TransactionCommonNext,
	Transaction as TransactionNext,
} from "@bitauth/libauth";
import type { SignTransactionRequest as WizardSignRequest } from "@wizardconnect/core";
import type {
	Input as Input300,
	Output as Output300,
	Transaction as Transaction300,
	TransactionCommon as TransactionCommon300,
} from "libauth-300";
import { describe, expectTypeOf, it } from "vitest";
import type {
	WcSignTransactionRequest as WcRequest8,
	WcSignTransactionResponse as WcResponse8,
	WcSourceOutput as WcSourceOutput8,
} from "wc2-interfaces-008";
import type {
	SignTransactionRequest,
	SignTransactionResponse,
	SourceOutput,
	Transaction,
	TransactionInput,
	TransactionOutput,
} from "../../src/index.js";

/** Makes arrays mutable while keeping properties readonly. */
type MutableArrays<T> = T extends Uint8Array
	? T
	: T extends readonly (infer E)[]
		? MutableArrays<E>[]
		: T extends object
			? { readonly [K in keyof T]: MutableArrays<T[K]> }
			: T;

/** The `transaction` field of the WizardConnect SDK's sign request. */
type WizardTransactionSlot = WizardSignRequest["transaction"];

declare const bytes: Uint8Array;
declare const coreRequest: SignTransactionRequest;
declare const coreTransaction: Transaction;

describe("SDK types assigned to core types", () => {
	it("should accept libauth 3.1.0-next.8", () => {
		expectTypeOf<TransactionCommonNext>().toExtend<Transaction>();
		expectTypeOf<TransactionNext>().toExtend<Transaction>();
		expectTypeOf<InputNext>().toExtend<TransactionInput>();
		expectTypeOf<OutputNext>().toExtend<TransactionOutput>();
	});

	it("should accept libauth 3.0.0", () => {
		expectTypeOf<TransactionCommon300>().toExtend<Transaction>();
		expectTypeOf<Transaction300>().toExtend<Transaction>();
		expectTypeOf<Input300>().toExtend<TransactionInput>();
		expectTypeOf<Output300>().toExtend<TransactionOutput>();
	});

	it("should accept @bch-wc2/interfaces 0.0.16", () => {
		expectTypeOf<WcSourceOutput16>().toExtend<SourceOutput>();
		expectTypeOf<WcRequest16>().toExtend<SignTransactionRequest>();
		expectTypeOf<WcResponse16>().toExtend<SignTransactionResponse>();
	});

	it("should accept @bch-wc2/interfaces 0.0.8", () => {
		expectTypeOf<WcSourceOutput8>().toExtend<SourceOutput>();
		expectTypeOf<WcRequest8>().toExtend<SignTransactionRequest>();
		expectTypeOf<WcResponse8>().toExtend<SignTransactionResponse>();
	});

	it("should accept the WizardConnect SDK's sign request", () => {
		expectTypeOf<WizardTransactionSlot>().toEqualTypeOf<WcRequest8>();
		expectTypeOf<WizardTransactionSlot>().toExtend<SignTransactionRequest>();
	});
});

describe("core types assigned to SDK types", () => {
	it("should accept every shape without arrays", () => {
		expectTypeOf<TransactionInput>().toExtend<InputNext>();
		expectTypeOf<TransactionInput>().toExtend<Input300>();
		expectTypeOf<TransactionOutput>().toExtend<OutputNext>();
		expectTypeOf<TransactionOutput>().toExtend<Output300>();
		expectTypeOf<SourceOutput>().toExtend<WcSourceOutput16>();
		expectTypeOf<SourceOutput>().toExtend<WcSourceOutput8>();
		expectTypeOf<SignTransactionResponse>().toExtend<WcResponse16>();
		expectTypeOf<SignTransactionResponse>().toExtend<WcResponse8>();
	});

	it("should reject shapes with readonly arrays", () => {
		expectTypeOf<Transaction>().not.toExtend<TransactionCommonNext>();
		expectTypeOf<Transaction>().not.toExtend<TransactionCommon300>();
		expectTypeOf<SignTransactionRequest>().not.toExtend<WcRequest16>();
		expectTypeOf<SignTransactionRequest>().not.toExtend<WcRequest8>();
		// @ts-expect-error - `readonly SourceOutput[]` is not `WcSourceOutput[]`.
		const slot: WizardTransactionSlot = coreRequest;
		// @ts-expect-error - `readonly TransactionInput[]` is not `Input[]`.
		const tx: TransactionNext = coreTransaction;
		void [slot, tx];
	});

	it("should accept them once arrays are mutable", () => {
		expectTypeOf<
			MutableArrays<Transaction>
		>().toExtend<TransactionCommonNext>();
		expectTypeOf<MutableArrays<Transaction>>().toExtend<TransactionCommon300>();
		expectTypeOf<
			MutableArrays<SignTransactionRequest>
		>().toExtend<WcRequest16>();
		expectTypeOf<
			MutableArrays<SignTransactionRequest>
		>().toExtend<WcRequest8>();
		expectTypeOf<
			MutableArrays<SignTransactionRequest>
		>().toExtend<WizardTransactionSlot>();
	});
});

describe("transaction type literals", () => {
	it("should accept a source output with contract display data", () => {
		const request: SignTransactionRequest = {
			transaction: "00",
			sourceOutputs: [
				{
					outpointIndex: 0,
					outpointTransactionHash: bytes,
					sequenceNumber: 0,
					unlockingBytecode: bytes,
					lockingBytecode: bytes,
					valueSatoshis: 1000n,
					contract: {
						abiFunction: {
							name: "spend",
							inputs: [{ name: "sig", type: "sig" }],
						},
						redeemScript: bytes,
						artifact: { contractName: "P2PKH" },
					},
				},
			],
			broadcast: false,
			userPrompt: "Sign?",
		};
		void request;
	});

	it("should reject a transaction without inputs", () => {
		// @ts-expect-error - `inputs` is required.
		const tx: Transaction = { locktime: 0, outputs: [], version: 2 };
		void tx;
	});

	it("should reject a number for valueSatoshis", () => {
		const output: TransactionOutput = {
			lockingBytecode: bytes,
			// @ts-expect-error - satoshis are `bigint`.
			valueSatoshis: 1000,
		};
		void output;
	});

	it("should reject a source output without an outpoint", () => {
		// @ts-expect-error - a source output is an input and an output.
		const source: SourceOutput = {
			lockingBytecode: bytes,
			valueSatoshis: 1000n,
		};
		void source;
	});
});
