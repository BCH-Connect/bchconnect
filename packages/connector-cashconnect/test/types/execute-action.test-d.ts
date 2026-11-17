import type { Session } from "@bchconnect/core";
import { describe, expectTypeOf, it } from "vitest";
import {
	type CashConnectActionResult,
	type CashConnectExecuteActionResult,
	executeAction,
} from "../../src/index.js";
import {
	client,
	type Other,
	otherClient,
	type TestCashConnect,
} from "./fixtures/client.js";
import type { FixtureTemplate } from "./fixtures/template.js";

declare const session: Session<TestCashConnect>;
declare const otherSession: Session<Other>;

const optionalParams = { implicit: "a", explicit: "b" };

describe("executeAction", () => {
	it("should resolve with the action's own result", () => {
		const result = executeAction(client, session, "optional", optionalParams);
		expectTypeOf(result).resolves.toEqualTypeOf<
			CashConnectActionResult<FixtureTemplate, "optional">
		>();
		expectTypeOf(result).resolves.not.toEqualTypeOf<
			CashConnectExecuteActionResult<FixtureTemplate>
		>();
	});

	it("should infer the template from a session returned by session()", () => {
		const current = client.session("cashconnect");
		if (current === null) return;
		expectTypeOf(
			executeAction(client, current, "groups", {
				pool: { amount: 1n, recipient: "bchtest:q" },
			}),
		).resolves.toEqualTypeOf<
			CashConnectActionResult<FixtureTemplate, "groups">
		>();
	});

	it("should keep request() typed as the union over actions", () => {
		expectTypeOf(
			client.request(session, "executeAction", {
				action: "optional",
				params: optionalParams,
			}),
		).resolves.toEqualTypeOf<CashConnectExecuteActionResult<FixtureTemplate>>();
	});

	it("should reject an unknown action", () => {
		// @ts-expect-error - not an action of the template.
		executeAction(client, session, "mint", {});
	});

	it("should reject a param of the wrong type", () => {
		executeAction(client, session, "optional", {
			...optionalParams,
			// @ts-expect-error - satoshis are `bigint`.
			optional: 1_000,
		});
	});

	it("should reject another action's params", () => {
		executeAction(client, session, "optional", {
			...optionalParams,
			// @ts-expect-error - `groups` params, not `optional` params.
			pool: { amount: 1n, recipient: "bchtest:q" },
		});
	});

	it("should reject a session of another protocol", () => {
		// @ts-expect-error - not a CashConnect session.
		executeAction(client, otherSession, "optional", optionalParams);
	});

	it("should reject a client without CashConnect", () => {
		// @ts-expect-error - otherClient has no CashConnect.
		executeAction(otherClient, session, "optional", optionalParams);
	});
});
