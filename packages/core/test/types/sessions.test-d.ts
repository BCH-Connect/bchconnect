import { describe, expectTypeOf, it } from "vitest";
import type { Session, SignTransactionRequest } from "../../src/index.js";
import type { CashConnectSessionData } from "./fixtures/cashconnect.js";
import {
	assertNever,
	client,
	type TestCashConnect,
	type TestSession,
	type TestWizard,
} from "./fixtures/client.js";
import type { LiteralTemplate } from "./fixtures/template-literal.js";
import type { Wc2, Wc2SessionData } from "./fixtures/wc2.js";
import type {
	DecryptExtension,
	StealthExtension,
	WizardSessionData,
} from "./fixtures/wizard.js";

declare const signRequest: SignTransactionRequest;

describe("session narrowing", () => {
	it("should narrow data by protocol", () => {
		const session = client.current;
		if (session === null) return;

		switch (session.protocol) {
			case "wizardconnect":
				expectTypeOf(session.data).toEqualTypeOf<
					WizardSessionData<[StealthExtension, DecryptExtension]>
				>();
				break;
			case "bch-wc2":
				expectTypeOf(session.data).toEqualTypeOf<Wc2SessionData>();
				break;
			case "cashconnect":
				expectTypeOf(session.data).toEqualTypeOf<
					CashConnectSessionData<LiteralTemplate>
				>();
				break;
			default:
				assertNever(session);
		}
	});

	it("should narrow the whole session", () => {
		const session = client.current;
		if (session === null || session.protocol !== "cashconnect") return;
		expectTypeOf(session).toEqualTypeOf<Session<TestCashConnect>>();
	});

	it("should fail exhaustiveness when a protocol is unhandled", () => {
		const check = (session: TestSession): string => {
			switch (session.protocol) {
				case "wizardconnect":
					return "wizard";
				case "bch-wc2":
					return "wc2";
				default:
					// @ts-expect-error - the CashConnect case is unhandled.
					return assertNever(session);
			}
		};
		void check;
	});
});

describe("connect", () => {
	it("should resolve to the session of the given protocol", () => {
		expectTypeOf(client.connect("wizardconnect")).resolves.toEqualTypeOf<
			Session<TestWizard>
		>();
		expectTypeOf(client.connect("bch-wc2")).resolves.toEqualTypeOf<
			Session<Wc2>
		>();
		expectTypeOf(client.connect("cashconnect")).resolves.toEqualTypeOf<
			Session<TestCashConnect>
		>();
	});

	it("should accept options", () => {
		expectTypeOf(
			client.connect("bch-wc2", { mode: "add" }),
		).resolves.toEqualTypeOf<Session<Wc2>>();
	});

	it("should reject an unregistered protocol", () => {
		// @ts-expect-error - "metamask" is not registered.
		client.connect("metamask");
	});
});

describe("session accessor", () => {
	it("should return the session of the given protocol or null", () => {
		expectTypeOf(
			client.session("wizardconnect"),
		).toEqualTypeOf<Session<TestWizard> | null>();
		expectTypeOf(
			client.session("bch-wc2"),
		).toEqualTypeOf<Session<Wc2> | null>();
		expectTypeOf(
			client.session("cashconnect"),
		).toEqualTypeOf<Session<TestCashConnect> | null>();
	});

	it("should type requests after a null check", () => {
		const session = client.session("wizardconnect");
		if (session === null) return;
		expectTypeOf(
			client.request(session, "sign_transaction", {
				transaction: signRequest,
				inputPaths: [],
			}),
		).resolves.toEqualTypeOf<{ signedTransaction: string }>();
		expectTypeOf(
			client.request(session, "decrypt", { ciphertext: "x" }),
		).resolves.toEqualTypeOf<{ plaintext: string }>();
	});

	it("should reject an unregistered protocol", () => {
		// @ts-expect-error - "metamask" is not registered.
		client.session("metamask");
	});
});
