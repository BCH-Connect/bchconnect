import { describe, expectTypeOf, it } from "vitest";
import {
	type CashConnectActionName,
	type CashConnectActionParams,
	type CashConnectActionReturns,
	type CashConnectTemplate,
	type SendTemplate,
	type SendTokensTemplate,
	sendTemplate,
	sendTokensTemplate,
} from "../../src/index.js";

describe("sendTemplate", () => {
	it("should have its declared type", () => {
		expectTypeOf(sendTemplate).toEqualTypeOf<SendTemplate>();
	});

	it("should be a template", () => {
		expectTypeOf<SendTemplate>().toExtend<CashConnectTemplate>();
	});

	it("should have one send action", () => {
		expectTypeOf<CashConnectActionName<SendTemplate>>().toEqualTypeOf<"send">();
	});

	it("should take an address and an amount", () => {
		expectTypeOf<
			CashConnectActionParams<SendTemplate, "send">
		>().toEqualTypeOf<{
			readonly recipient: string;
			readonly amount: bigint;
		}>();
	});

	it("should return the signed transaction and its hash", () => {
		expectTypeOf<
			CashConnectActionReturns<SendTemplate, "send">
		>().toEqualTypeOf<{
			readonly tx: Uint8Array;
			readonly txHash: Uint8Array;
		}>();
	});
});

describe("sendTokensTemplate", () => {
	it("should have its declared type", () => {
		expectTypeOf(sendTokensTemplate).toEqualTypeOf<SendTokensTemplate>();
	});

	it("should be a template", () => {
		expectTypeOf<SendTokensTemplate>().toExtend<CashConnectTemplate>();
	});

	it("should have one sendTokens action", () => {
		expectTypeOf<
			CashConnectActionName<SendTokensTemplate>
		>().toEqualTypeOf<"sendTokens">();
	});

	it("should take an address, a category and an amount", () => {
		expectTypeOf<
			CashConnectActionParams<SendTokensTemplate, "sendTokens">
		>().toEqualTypeOf<{
			readonly recipient: string;
			readonly category: Uint8Array;
			readonly amount: bigint;
		}>();
	});

	it("should return the signed transaction and its hash", () => {
		expectTypeOf<
			CashConnectActionReturns<SendTokensTemplate, "sendTokens">
		>().toEqualTypeOf<{
			readonly tx: Uint8Array;
			readonly txHash: Uint8Array;
		}>();
	});
});
