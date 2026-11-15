import type { MethodName, MethodParams, MethodResult } from "@bchconnect/core";
import { describe, expectTypeOf, it } from "vitest";
import type { WalletConnect, WalletConnectConfig } from "../../src/index.js";

// Applies to every test file of the package: they are one TypeScript program.
declare module "../../src/types.js" {
	interface WalletConnectCustomMethods {
		// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
		bch_cancelPendingRequests: {
			params: Record<string, never>;
			result: { cancelledCount: number };
		};
	}
}

describe("WalletConnectCustomMethods", () => {
	it("should add a declared method to the protocol's methods", () => {
		expectTypeOf<MethodName<WalletConnect>>().toEqualTypeOf<
			| "bch_getAddresses"
			| "bch_signTransaction"
			| "bch_signMessage"
			| "bch_cancelPendingRequests"
		>();
	});

	it("should type a declared method's params and result", () => {
		expectTypeOf<
			MethodParams<WalletConnect, "bch_cancelPendingRequests">
		>().toEqualTypeOf<Record<string, never>>();
		expectTypeOf<
			MethodResult<WalletConnect, "bch_cancelPendingRequests">
		>().toEqualTypeOf<{ cancelledCount: number }>();
	});

	it("should let the connector propose declared methods only", () => {
		expectTypeOf<WalletConnectConfig["methods"]>().toEqualTypeOf<
			readonly "bch_cancelPendingRequests"[] | undefined
		>();
	});
});
