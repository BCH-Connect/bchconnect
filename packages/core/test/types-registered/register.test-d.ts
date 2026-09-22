import { describe, expectTypeOf, it } from "vitest";
import type { RegisteredClient } from "../../src/index.js";
import {
	type client,
	type TestSession,
	useClient,
	useSession,
} from "../types/fixtures/client.js";

// A separate program: augmenting Register is global.
declare module "../../src/index.js" {
	interface Register {
		client: typeof client;
	}
}

describe("register with augmentation", () => {
	it("should resolve to the registered client and its sessions", () => {
		expectTypeOf<RegisteredClient>().toEqualTypeOf<typeof client>();
		expectTypeOf(useSession()).toEqualTypeOf<TestSession | null>();
	});

	it("should narrow the protocol and type session data", () => {
		const session = useSession();
		if (session === null) return;
		expectTypeOf(session.protocol).toEqualTypeOf<
			"wizardconnect" | "bch-wc2" | "cashconnect"
		>();
		expectTypeOf(session.data).not.toBeUnknown();
	});

	it("should reject a misspelled method name", () => {
		const session = useSession();
		if (session === null || session.protocol !== "bch-wc2") return;
		// @ts-expect-error - not a wc2 method.
		useClient().request(session, "bch_sgnMessage", undefined);
	});
});
