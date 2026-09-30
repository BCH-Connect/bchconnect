/**
 * `Network` mirrors `@bchconnect/core`'s type of the same name; a modal
 * showing a network the client can't actually target (or vice versa) is a
 * bug neither package's own tests would catch.
 */

import { describe, expectTypeOf, it } from "vitest";
import type { Network as CoreNetwork } from "../../core/src/types/protocol.ts";
import type { Network } from "../src/state.ts";

describe("Network", () => {
	it("is exactly core's Network", () => {
		expectTypeOf<Network>().toEqualTypeOf<CoreNetwork>();
	});
});
