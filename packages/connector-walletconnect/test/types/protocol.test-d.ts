import type {
	EventName,
	MethodName,
	MethodResult,
	ProtocolDefinition,
} from "@bchconnect/core";
import { describe, expectTypeOf, it } from "vitest";
import type {
	WalletConnect,
	WalletConnectStandardMethods,
} from "../../src/index.js";

describe("WalletConnect", () => {
	it("should have exactly three standard methods", () => {
		expectTypeOf<keyof WalletConnectStandardMethods>().toEqualTypeOf<
			"bch_getAddresses" | "bch_signTransaction" | "bch_signMessage"
		>();
	});

	it("should include every standard method", () => {
		expectTypeOf<keyof WalletConnectStandardMethods>().toExtend<
			MethodName<WalletConnect>
		>();
	});

	it("should declare no events", () => {
		expectTypeOf<EventName<WalletConnect>>().toBeNever();
	});

	it("should resolve message signing to a string", () => {
		expectTypeOf<
			MethodResult<WalletConnect, "bch_signMessage">
		>().toEqualTypeOf<string>();
	});

	it("should be a protocol definition", () => {
		expectTypeOf<WalletConnect>().toExtend<ProtocolDefinition>();
	});
});
