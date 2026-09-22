import { describe, expectTypeOf, it } from "vitest";
import type { LibauthSigning, Session } from "../../src/index.js";
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
