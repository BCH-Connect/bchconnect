import { describe, expectTypeOf, it } from "vitest";
import {
	type RequestOptions,
	type Session,
	type SignMessageRequest,
	type SignMessageResponse,
	type SignTransactionRequest,
	type SignTransactionResponse,
	signMessage,
	signTransaction,
} from "../../src/index.js";
import {
	bareClient,
	client,
	type TestCashConnect,
	type TestWizard,
} from "./fixtures/client.js";
import type { Wc2 } from "./fixtures/wc2.js";

declare const wc2Session: Session<Wc2>;
declare const wizardSession: Session<TestWizard>;
declare const ccSession: Session<TestCashConnect>;
declare const unnarrowed: NonNullable<typeof client.current>;
declare const tx: SignTransactionRequest;
declare const message: SignMessageRequest;
declare const opts: RequestOptions;

describe("signTransaction", () => {
	it("should resolve with the signing response", () => {
		expectTypeOf(
			signTransaction(client, wc2Session, tx),
		).resolves.toEqualTypeOf<SignTransactionResponse>();
	});

	it("should accept any session of the client, narrowed or not", () => {
		signTransaction(client, wizardSession, tx, opts);
		signTransaction(client, ccSession, tx);
		signTransaction(client, unnarrowed, tx);
	});

	it("should reject a session of a protocol the client does not register", () => {
		// @ts-expect-error - wc2 is not registered on this client.
		signTransaction(bareClient, wc2Session, tx);
	});

	it("should reject a message in place of a transaction", () => {
		// @ts-expect-error - a message is not a transaction.
		signTransaction(client, wc2Session, message);
	});
});

describe("signMessage", () => {
	it("should resolve with the signature", () => {
		expectTypeOf(
			signMessage(client, wc2Session, message, opts),
		).resolves.toEqualTypeOf<SignMessageResponse>();
	});

	it("should reject a session of a protocol the client does not register", () => {
		// @ts-expect-error - wc2 is not registered on this client.
		signMessage(bareClient, wc2Session, message);
	});

	it("should reject a transaction in place of a message", () => {
		// @ts-expect-error - a transaction is not a message.
		signMessage(client, wc2Session, tx);
	});
});
