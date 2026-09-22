import { describe, expectTypeOf, it } from "vitest";
import type {
	Client,
	ProtocolDefinition,
	RegisteredClient,
	RegisteredSession,
	Session,
} from "../../src/index.js";
import { useClient, useSession } from "./fixtures/client.js";

// The augmented counterpart is types-registered/register.test-d.ts.
describe("register without augmentation", () => {
	it("should fall back to the loose client and session", () => {
		expectTypeOf<RegisteredClient>().toEqualTypeOf<
			Client<ProtocolDefinition>
		>();
		expectTypeOf<RegisteredSession>().toEqualTypeOf<
			Session<ProtocolDefinition>
		>();
	});

	it("should type session data as unknown", () => {
		const session = useSession();
		if (session === null) return;
		expectTypeOf(session.data).toBeUnknown();
		expectTypeOf(session.protocol).toEqualTypeOf<string>();
	});

	it("should accept any method name and return unknown", () => {
		const client = useClient();
		const session = useSession();
		if (session === null) return;
		// A misspelled method compiles here; METHOD_UNSUPPORTED catches it at runtime.
		expectTypeOf(
			client.request(session, "bch_sgnMessage", undefined),
		).toEqualTypeOf<Promise<unknown>>();
	});
});
