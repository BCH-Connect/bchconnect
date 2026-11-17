import type { Transaction } from "@bchconnect/core";
import type { Template } from "@cashconnect-js/core/templates";
import { describe, expectTypeOf, it } from "vitest";
import type {
	CashConnectActionName,
	CashConnectActionParams,
	CashConnectActionResult,
	CashConnectActionReturns,
	CashConnectExecuteActionParams,
	CashConnectExecuteActionResult,
	CashConnectLeafValue,
	CashConnectTemplate,
	CashConnectValue,
	CashConnectValues,
} from "../../src/index.js";
import type { FixtureTemplate } from "./fixtures/template.js";

describe("CashConnectTemplate", () => {
	it("should accept a template typed by the SDK", () => {
		expectTypeOf<Template>().toExtend<CashConnectTemplate>();
	});

	it("should accept a literal checked against the SDK's template", () => {
		expectTypeOf<FixtureTemplate>().toExtend<CashConnectTemplate>();
	});
});

describe("CashConnectActionName", () => {
	it("should list the template's actions", () => {
		expectTypeOf<CashConnectActionName<FixtureTemplate>>().toEqualTypeOf<
			"leaves" | "optional" | "groups"
		>();
	});
});

describe("CashConnectLeafValue", () => {
	it("should type amounts and numbers as bigint", () => {
		expectTypeOf<
			CashConnectLeafValue<{ type: "satoshis"; name: "" }>
		>().toEqualTypeOf<bigint>();
		expectTypeOf<
			CashConnectLeafValue<{ type: "number"; name: "" }>
		>().toEqualTypeOf<bigint>();
	});

	it("should type text and addresses as string", () => {
		expectTypeOf<
			CashConnectLeafValue<{ type: "string"; name: "" }>
		>().toEqualTypeOf<string>();
		expectTypeOf<
			CashConnectLeafValue<{ type: "address"; name: "" }>
		>().toEqualTypeOf<string>();
	});

	it("should type every other variable as bytes", () => {
		expectTypeOf<
			CashConnectLeafValue<{
				type:
					| "bytes"
					| "enum"
					| "publicKey"
					| "signature"
					| "transaction"
					| "transactionHash";
				name: "";
			}>
		>().toEqualTypeOf<Uint8Array>();
	});
});

describe("CashConnectActionParams", () => {
	it("should type each param by its declared type", () => {
		expectTypeOf<
			CashConnectActionParams<FixtureTemplate, "leaves">
		>().toEqualTypeOf<{
			readonly address: string;
			readonly bytes: Uint8Array;
			readonly enum: Uint8Array;
			readonly number: bigint;
			readonly publicKey: Uint8Array;
			readonly satoshis: bigint;
			readonly signature: Uint8Array;
			readonly string: string;
			readonly transaction: Uint8Array;
			readonly transactionHash: Uint8Array;
		}>();
	});

	it("should make only `required: false` params optional", () => {
		expectTypeOf<
			CashConnectActionParams<FixtureTemplate, "optional">
		>().toEqualTypeOf<{
			readonly implicit: string;
			readonly explicit: string;
			readonly optional?: bigint;
		}>();
	});

	it("should type object params as one record and array params as a list", () => {
		expectTypeOf<
			CashConnectActionParams<FixtureTemplate, "groups">
		>().toEqualTypeOf<{
			readonly pool: { readonly amount: bigint; readonly recipient: string };
			readonly outputs?: readonly {
				readonly lockingBytecode: Uint8Array;
				readonly value: bigint;
			}[];
		}>();
	});
});

describe("CashConnectActionReturns", () => {
	it("should type returned values by their declared types", () => {
		expectTypeOf<
			CashConnectActionReturns<FixtureTemplate, "leaves">
		>().toEqualTypeOf<{
			readonly number: bigint;
			readonly address: string;
			readonly bytes: Uint8Array;
		}>();
		expectTypeOf<
			CashConnectActionReturns<FixtureTemplate, "optional">
		>().toEqualTypeOf<{ readonly maybe?: Uint8Array }>();
		expectTypeOf<
			CashConnectActionReturns<FixtureTemplate, "groups">
		>().toEqualTypeOf<{ readonly receipt: { readonly memo: string } }>();
	});
});

describe("CashConnectActionResult", () => {
	it("should carry the returns, the signed transactions and the balance changes", () => {
		expectTypeOf<
			CashConnectActionResult<FixtureTemplate, "leaves">
		>().toEqualTypeOf<{
			readonly data: CashConnectActionReturns<FixtureTemplate, "leaves">;
			readonly transactions: readonly Transaction[];
			readonly balanceChanges: Readonly<Record<string, bigint>>;
		}>();
	});
});

describe("CashConnectExecuteActionParams", () => {
	it("should be a union discriminated by action name", () => {
		expectTypeOf<
			CashConnectExecuteActionParams<FixtureTemplate>
		>().toEqualTypeOf<
			| {
					readonly action: "leaves";
					readonly params: CashConnectActionParams<FixtureTemplate, "leaves">;
			  }
			| {
					readonly action: "optional";
					readonly params: CashConnectActionParams<FixtureTemplate, "optional">;
			  }
			| {
					readonly action: "groups";
					readonly params: CashConnectActionParams<FixtureTemplate, "groups">;
			  }
		>();
	});
});

describe("CashConnectExecuteActionResult", () => {
	it("should be the union of every action's result", () => {
		expectTypeOf<
			CashConnectExecuteActionResult<FixtureTemplate>
		>().toEqualTypeOf<
			| CashConnectActionResult<FixtureTemplate, "leaves">
			| CashConnectActionResult<FixtureTemplate, "optional">
			| CashConnectActionResult<FixtureTemplate, "groups">
		>();
	});
});

describe("a template without literal types", () => {
	it("should type a variable of any declared type as every value a leaf can take", () => {
		expectTypeOf<
			CashConnectValue<CashConnectTemplate["actions"][string]["params"][string]>
		>().toEqualTypeOf<
			| bigint
			| string
			| Uint8Array
			| { readonly [name: string]: bigint | string | Uint8Array }
			| readonly { readonly [name: string]: bigint | string | Uint8Array }[]
		>();
	});

	it("should type the params of an SDK-typed template the same way", () => {
		expectTypeOf<CashConnectActionParams<Template, string>[string]>().toExtend<
			| bigint
			| string
			| Uint8Array
			| { readonly [name: string]: bigint | string | Uint8Array }
			| readonly { readonly [name: string]: bigint | string | Uint8Array }[]
		>();
		expectTypeOf<bigint>().toExtend<
			CashConnectActionParams<Template, string>[string]
		>();
	});
});

describe("CashConnectValues", () => {
	it("should make a grouped variable declared optional an optional key of its group", () => {
		expectTypeOf<
			CashConnectValue<{
				type: "object";
				properties: {
					always: { type: "bytes"; name: "" };
					maybe: { type: "satoshis"; name: ""; required: false };
				};
			}>
		>().toEqualTypeOf<{
			readonly always: Uint8Array;
			readonly maybe?: bigint;
		}>();
		expectTypeOf<
			CashConnectValue<{
				type: "array";
				properties: { maybe: { type: "string"; name: ""; required: false } };
			}>
		>().toEqualTypeOf<readonly { readonly maybe?: string }[]>();
	});

	it("should take no value for an action that declares no params", () => {
		type None = CashConnectValues<Record<never, never>>;

		expectTypeOf<Record<never, never>>().toExtend<None>();
		expectTypeOf<{ amount: bigint }>().not.toExtend<None>();
	});
});
