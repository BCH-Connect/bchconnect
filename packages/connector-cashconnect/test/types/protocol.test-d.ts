import type {
	EventName,
	EventPayload,
	MethodName,
	MethodParams,
	MethodResult,
	ProtocolDefinition,
	Session,
	TransactionOutput,
} from "@bchconnect/core";
import { describe, expectTypeOf, it } from "vitest";
import type {
	CashConnect,
	CashConnectBalances,
	CashConnectChain,
	CashConnectConfig,
	CashConnectExecuteActionParams,
	CashConnectExecuteActionResult,
	CashConnectSessionData,
	CashConnectTemplate,
} from "../../src/index.js";
import { client, type TestCashConnect } from "./fixtures/client.js";
import type { FixtureTemplate } from "./fixtures/template.js";

describe("CashConnect", () => {
	it("should have exactly three methods", () => {
		expectTypeOf<MethodName<CashConnect>>().toEqualTypeOf<
			"getBalances" | "getTokens" | "executeAction"
		>();
	});

	it("should take no params for the reads", () => {
		expectTypeOf<
			MethodParams<CashConnect, "getBalances">
		>().toEqualTypeOf<undefined>();
		expectTypeOf<
			MethodParams<CashConnect, "getTokens">
		>().toEqualTypeOf<undefined>();
	});

	it("should resolve the reads to balances and token outputs", () => {
		expectTypeOf<
			MethodResult<CashConnect, "getBalances">
		>().toEqualTypeOf<CashConnectBalances>();
		expectTypeOf<MethodResult<CashConnect, "getTokens">>().toEqualTypeOf<
			readonly TransactionOutput[]
		>();
	});

	it("should type executeAction by the template", () => {
		expectTypeOf<
			MethodParams<TestCashConnect, "executeAction">
		>().toEqualTypeOf<CashConnectExecuteActionParams<FixtureTemplate>>();
		expectTypeOf<
			MethodResult<TestCashConnect, "executeAction">
		>().toEqualTypeOf<CashConnectExecuteActionResult<FixtureTemplate>>();
	});

	it("should mark executeAction as needing the user", () => {
		expectTypeOf<
			CashConnect["methods"]["executeAction"]["userInteraction"]
		>().toEqualTypeOf<true>();
	});

	it("should declare the balance event", () => {
		expectTypeOf<EventName<CashConnect>>().toEqualTypeOf<"balancesChanged">();
		expectTypeOf<EventPayload<CashConnect, "balancesChanged">>().toEqualTypeOf<{
			readonly balances: CashConnectBalances;
		}>();
	});

	it("should declare template execution as its capability", () => {
		expectTypeOf<
			CashConnect["capability"]
		>().toEqualTypeOf<"template-execution">();
	});

	it("should default to any template", () => {
		expectTypeOf<CashConnect>().toEqualTypeOf<
			CashConnect<CashConnectTemplate>
		>();
	});

	it("should be a protocol definition", () => {
		expectTypeOf<CashConnect>().toExtend<ProtocolDefinition>();
		expectTypeOf<TestCashConnect>().toExtend<ProtocolDefinition>();
	});
});

describe("CashConnectBalances", () => {
	it("should always have satoshis and key categories by hex", () => {
		expectTypeOf<CashConnectBalances["sats"]>().toEqualTypeOf<bigint>();
		expectTypeOf<CashConnectBalances[string]>().toEqualTypeOf<bigint>();
	});
});

describe("CashConnectSessionData", () => {
	it("should carry the session's template", () => {
		expectTypeOf<
			CashConnectSessionData<FixtureTemplate>["template"]
		>().toEqualTypeOf<FixtureTemplate>();
	});

	it("should name the chain by its CashAddr prefix", () => {
		expectTypeOf<CashConnectSessionData["chain"]>().toEqualTypeOf<
			"bitcoincash" | "bchtest" | "bchreg"
		>();
		expectTypeOf<CashConnectChain>().toEqualTypeOf<
			"bitcoincash" | "bchtest" | "bchreg"
		>();
	});
});

describe("CashConnectConfig", () => {
	it("should require the template and keep allowed tokens optional", () => {
		expectTypeOf<CashConnectConfig<FixtureTemplate>>().toEqualTypeOf<{
			readonly template: FixtureTemplate;
			readonly allowedTokens?: readonly string[];
		}>();
	});
});

describe("session narrowing", () => {
	it("should narrow a client's session to CashConnect by its protocol", () => {
		const session = client.current;
		if (session === null) return;
		if (session.protocol === "cashconnect") {
			expectTypeOf(session).toEqualTypeOf<Session<TestCashConnect>>();
			expectTypeOf(session.data).toEqualTypeOf<
				CashConnectSessionData<FixtureTemplate>
			>();
		} else {
			expectTypeOf(session.protocol).toEqualTypeOf<"other">();
		}
	});

	it("should return a CashConnect session by protocol id", () => {
		expectTypeOf(
			client.session("cashconnect"),
		).toEqualTypeOf<Session<TestCashConnect> | null>();
	});
});
