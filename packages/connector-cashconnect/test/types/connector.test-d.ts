import {
	type Connector,
	createClient,
	type Session,
	type SessionOf,
} from "@bchconnect/core";
import { describe, expectTypeOf, it } from "vitest";
import {
	type CashConnect,
	type CashConnectSessionData,
	type CashConnectTemplate,
	cashConnect,
	type SendTemplate,
	sendTemplate,
} from "../../src/index.js";
import type { Other } from "./fixtures/client.js";
import { type FixtureTemplate, fixtureTemplate } from "./fixtures/template.js";

const connector = cashConnect({ template: fixtureTemplate });
const inline = cashConnect({
	template: {
		name: "Inline",
		actions: {
			echo: {
				params: { text: { type: "string", name: "Text" } },
				instructions: [],
				returns: { total: { type: "number", name: "Total" } },
			},
		},
	},
});
declare const otherConnector: Connector<Other>;
const client = createClient({
	connectors: [connector, otherConnector],
	network: "chipnet",
	appMetadata: { name: "Type test", url: "https://dapp.example" },
});
declare const session: Session<CashConnect<FixtureTemplate>>;
declare const anySession: SessionOf<CashConnect<FixtureTemplate> | Other>;
declare const loose: CashConnectTemplate;

describe("cashConnect", () => {
	it("should return a connector of the protocol, typed by the template", () => {
		expectTypeOf(connector).toEqualTypeOf<
			Connector<CashConnect<FixtureTemplate>>
		>();
		expectTypeOf(cashConnect({ template: sendTemplate })).toEqualTypeOf<
			Connector<CashConnect<SendTemplate>>
		>();
		expectTypeOf(cashConnect({ template: loose })).toEqualTypeOf<
			Connector<CashConnect<CashConnectTemplate>>
		>();
	});

	it("should be accepted wherever any connector is", () => {
		expectTypeOf(connector).toExtend<Connector>();
	});

	it("should keep the literal types of a template written inline", () => {
		expectTypeOf(inline).toEqualTypeOf<
			Connector<
				CashConnect<{
					readonly name: "Inline";
					readonly actions: {
						readonly echo: {
							readonly params: {
								readonly text: {
									readonly type: "string";
									readonly name: "Text";
								};
							};
							readonly instructions: readonly [];
							readonly returns: {
								readonly total: {
									readonly type: "number";
									readonly name: "Total";
								};
							};
						};
					};
				}>
			>
		>();
	});

	it("should require a template and take lowercase-hex token categories", () => {
		// @ts-expect-error The template is the dapp's contract with the wallet: there is no default.
		cashConnect({});
		expectTypeOf(cashConnect<SendTemplate>)
			.parameter(0)
			.toHaveProperty("allowedTokens")
			.toEqualTypeOf<readonly string[] | undefined>();
	});

	it("should type the client's session data", () => {
		expectTypeOf(client.session("cashconnect")).toEqualTypeOf<Session<
			CashConnect<FixtureTemplate>
		> | null>();
		expectTypeOf(session.data).toEqualTypeOf<
			CashConnectSessionData<FixtureTemplate>
		>();
	});

	it("should narrow a session of any protocol by its protocol id", () => {
		if (anySession.protocol === "cashconnect") {
			expectTypeOf(anySession).toEqualTypeOf<
				Session<CashConnect<FixtureTemplate>>
			>();
			expectTypeOf(anySession.data.template).toEqualTypeOf<FixtureTemplate>();
		} else {
			expectTypeOf(anySession.data).toEqualTypeOf<null>();
		}
	});

	it("should let a client ask whether a session can run template actions", () => {
		expectTypeOf(
			client.can(session, "template-execution"),
		).toEqualTypeOf<boolean>();
		expectTypeOf(client.can).toBeCallableWith(anySession, "template-execution");
	});

	it("should type requests made through a client built with it", () => {
		expectTypeOf(
			client.request(session, "getBalances", undefined),
		).resolves.toHaveProperty("sats");
		expectTypeOf(
			client.request(session, "executeAction", {
				action: "optional",
				params: { implicit: "a", explicit: "b" },
			}),
		).resolves.toHaveProperty("transactions");
	});
});
