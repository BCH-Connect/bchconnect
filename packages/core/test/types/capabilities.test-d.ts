import { describe, expectTypeOf, it } from "vitest";
import type {
	CapabilityMap,
	Connector,
	LibauthSigning,
	MessageSigning,
	RequestOptions,
	Session,
	SessionClient,
	SignMessageRequest,
	SignTransactionRequest,
} from "../../src/index.js";
import {
	client,
	type TestCashConnect,
	type TestWizard,
} from "./fixtures/client.js";
import type { Wc2 } from "./fixtures/wc2.js";

declare const wc2Session: Session<Wc2>;
declare const wizardSession: Session<TestWizard>;
declare const ccSession: Session<TestCashConnect>;
declare const unnarrowed: NonNullable<typeof client.current>;
declare const { request }: SessionClient<Wc2>;
declare const tx: SignTransactionRequest;
declare const message: SignMessageRequest;

describe("capability", () => {
	it("should return the interface or null when the protocol may have it", () => {
		expectTypeOf(
			client.capability(wc2Session, "libauth-signing"),
		).toEqualTypeOf<LibauthSigning | null>();
		expectTypeOf(
			client.capability(wizardSession, "libauth-signing"),
		).toEqualTypeOf<LibauthSigning | null>();
	});

	it("should return null when the protocol can never have it", () => {
		expectTypeOf(
			client.capability(ccSession, "libauth-signing"),
		).toEqualTypeOf<null>();
	});

	it("should return the interface or null on an un-narrowed session", () => {
		expectTypeOf(
			client.capability(unnarrowed, "libauth-signing"),
		).toEqualTypeOf<LibauthSigning | null>();
	});

	it("should reject a name outside the registry", () => {
		// @ts-expect-error - not in CapabilityRegistry.
		client.capability(wc2Session, "teleportation");
		// @ts-expect-error - a CashConnect capability name with no interface.
		client.capability(ccSession, "template-execution");
	});
});

describe("can", () => {
	it("should accept any capability name of the session's protocol", () => {
		expectTypeOf(
			client.can(ccSession, "template-execution"),
		).toEqualTypeOf<boolean>();
		expectTypeOf(
			client.can(wc2Session, "libauth-signing"),
		).toEqualTypeOf<boolean>();
		expectTypeOf(
			client.can(wizardSession, "decryption"),
		).toEqualTypeOf<boolean>();
	});

	it("should accept every registered name on an un-narrowed session", () => {
		expectTypeOf(
			client.can(unnarrowed, "template-execution"),
		).toEqualTypeOf<boolean>();
		expectTypeOf(client.can(unnarrowed, "decryption")).toEqualTypeOf<boolean>();
	});

	it("should reject a name the protocol can never have", () => {
		// @ts-expect-error - not a wc2 capability.
		client.can(wc2Session, "template-execution");
		// @ts-expect-error - not a CashConnect capability.
		client.can(ccSession, "libauth-signing");
		// @ts-expect-error - not a capability of any protocol.
		client.can(unnarrowed, "teleportation");
	});
});

describe("capability interfaces", () => {
	it("should take request options after the request", () => {
		expectTypeOf<LibauthSigning["signTransaction"]>()
			.parameter(1)
			.toEqualTypeOf<RequestOptions | undefined>();
		expectTypeOf<MessageSigning["signMessage"]>()
			.parameter(1)
			.toEqualTypeOf<RequestOptions | undefined>();
	});
});

describe("connector capabilities", () => {
	it("should key the map by the protocol's registered capability names", () => {
		expectTypeOf<keyof CapabilityMap<Wc2>>().toEqualTypeOf<
			"libauth-signing" | "message-signing"
		>();
		expectTypeOf<CapabilityMap<Wc2>["libauth-signing"]>().toEqualTypeOf<
			LibauthSigning | undefined
		>();
	});

	it("should leave out capability names with no registry entry", () => {
		expectTypeOf<keyof CapabilityMap<TestCashConnect>>().toEqualTypeOf<never>();
	});

	it("should build the map over the session-bound request", () => {
		const capabilities: NonNullable<Connector<Wc2>["capabilities"]> = (
			_session,
			{ request },
		) => ({
			"libauth-signing": {
				signTransaction: (req, opts) =>
					request("bch_signTransaction", req, opts),
			},
			"message-signing": {
				signMessage: (req, opts) => request("bch_signMessage", req, opts),
			},
		});
		expectTypeOf(capabilities).returns.toEqualTypeOf<CapabilityMap<Wc2>>();
	});

	it("should type the bound request by the protocol's methods", () => {
		expectTypeOf(request("bch_signTransaction", tx)).resolves.toHaveProperty(
			"signedTransaction",
		);
		// @ts-expect-error - a message is not a transaction.
		request("bch_signTransaction", message);
		// @ts-expect-error - not a wc2 method.
		request("sign_transaction", tx);
	});

	it("should reject a capability the protocol can never have", () => {
		const capabilities: CapabilityMap<Wc2> = {
			"message-signing": { signMessage: () => Promise.reject() },
			// @ts-expect-error - registered, but not a wc2 capability.
			decryption: { decrypt: () => Promise.reject() },
		};
		expectTypeOf(capabilities).toEqualTypeOf<CapabilityMap<Wc2>>();
	});

	it("should keep a connector with capabilities assignable to the config constraint", () => {
		expectTypeOf<Connector<Wc2>>().toExtend<Connector>();
		expectTypeOf<Connector<TestWizard>>().toExtend<Connector>();
	});
});
