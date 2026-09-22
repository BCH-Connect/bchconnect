import type { ActionResult } from "@cashconnect-js/core/templates";
import { describe, expectTypeOf, it } from "vitest";
import type {
	MethodName,
	ProtocolFor,
	Session,
	SignMessageResponse,
	SignTransactionRequest,
	SignTransactionResponse,
} from "../../src/index.js";
import {
	type ExecuteActionResult,
	executeAction,
} from "./fixtures/cashconnect.js";
import {
	bareClient,
	client,
	type TestCashConnect,
	type TestWizard,
} from "./fixtures/client.js";
import type { LiteralTemplate } from "./fixtures/template-literal.js";
import type { Wc2 } from "./fixtures/wc2.js";

declare const wc2Session: Session<Wc2>;
declare const wizardSession: Session<TestWizard>;
declare const ccSession: Session<TestCashConnect>;
declare const unnarrowed: NonNullable<typeof client.current>;
declare const signRequest: SignTransactionRequest;
declare const bytes: Uint8Array;

describe("request", () => {
	it("should type the result by method", () => {
		expectTypeOf(
			client.request(wc2Session, "bch_signMessage", { message: "hi" }),
		).resolves.toEqualTypeOf<SignMessageResponse>();
		expectTypeOf(
			client.request(wc2Session, "bch_signTransaction", signRequest),
		).resolves.toEqualTypeOf<SignTransactionResponse>();
	});

	it("should reject another protocol's method", () => {
		// @ts-expect-error - not a WizardConnect method.
		client.request(wizardSession, "bch_signMessage", { message: "hi" });
	});

	it("should reject wrong params", () => {
		// @ts-expect-error - `msg` is not `message`.
		client.request(wc2Session, "bch_signMessage", { msg: "hi" });
	});

	it("should reject an unknown method", () => {
		// @ts-expect-error - not a wc2 method.
		client.request(wc2Session, "bch_nope", undefined);
	});

	it("should offer no method on an un-narrowed session", () => {
		// The registered protocols share no method name.
		expectTypeOf<
			MethodName<
				ProtocolFor<TestWizard | Wc2 | TestCashConnect, typeof unnarrowed>
			>
		>().toBeNever();
		// @ts-expect-error - not common to every protocol.
		client.request(unnarrowed, "bch_signMessage", { message: "hi" });
	});
});

describe("protocol sugar over request", () => {
	it("should return the per-action result", () => {
		const result = executeAction(client, ccSession, "create", {
			amount: bytes,
			payoutLockingBytecode: bytes,
		});
		expectTypeOf(result).resolves.toEqualTypeOf<
			ActionResult<LiteralTemplate, "create">
		>();
		expectTypeOf(result).resolves.not.toEqualTypeOf<
			ExecuteActionResult<LiteralTemplate>
		>();
	});

	it("should infer the template from a session returned by session()", () => {
		const session = client.session("cashconnect");
		if (session === null) return;
		expectTypeOf(
			executeAction(client, session, "claim", {
				positions: [{ positionId: bytes }],
			}),
		).resolves.toEqualTypeOf<ActionResult<LiteralTemplate, "claim">>();
	});

	it("should keep request() typed as the union over actions", () => {
		expectTypeOf(
			client.request(ccSession, "executeAction", {
				action: "create",
				params: { amount: bytes, payoutLockingBytecode: bytes },
			}),
		).resolves.toEqualTypeOf<ExecuteActionResult<LiteralTemplate>>();
	});

	it("should reject an unknown action", () => {
		// @ts-expect-error - not an action of the template.
		executeAction(client, ccSession, "mint", {});
	});

	it("should reject another action's params", () => {
		executeAction(client, ccSession, "create", {
			// @ts-expect-error - `swap` params, not `create` params.
			fromCategory: bytes,
			toCategory: bytes,
		});
	});

	it("should reject a session of another protocol", () => {
		// @ts-expect-error - not a CashConnect session.
		executeAction(client, wizardSession, "create", {
			amount: bytes,
			payoutLockingBytecode: bytes,
		});
	});

	it("should reject a client without the protocol registered", () => {
		// @ts-expect-error - bareClient has no CashConnect.
		executeAction(bareClient, ccSession, "create", {
			amount: bytes,
			payoutLockingBytecode: bytes,
		});
	});
});
