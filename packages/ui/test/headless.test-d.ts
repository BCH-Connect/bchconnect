/**
 * A custom renderer imports from `@bchconnect/ui/headless` alone, so every
 * type `ModalView` reaches is exported there, identical to the main entry's.
 */

import { describe, expectTypeOf, it } from "vitest";
import type * as headless from "../src/headless.ts";
import type * as main from "../src/index.ts";

describe("headless entry types", () => {
	it("exports the view a renderer draws", () => {
		expectTypeOf<headless.ModalView>().toEqualTypeOf<main.ModalView>();
		expectTypeOf<headless.ModalScreen>().toEqualTypeOf<main.ModalScreen>();
		expectTypeOf<headless.ConnectPhase>().toEqualTypeOf<main.ConnectPhase>();
		expectTypeOf<headless.FailureReason>().toEqualTypeOf<main.FailureReason>();
		expectTypeOf<headless.ProtocolId>().toEqualTypeOf<main.ProtocolId>();
		expectTypeOf<headless.ProtocolOption>().toEqualTypeOf<main.ProtocolOption>();
		expectTypeOf<headless.ProtocolMark>().toEqualTypeOf<main.ProtocolMark>();
		expectTypeOf<headless.MarkShape>().toEqualTypeOf<main.MarkShape>();
		expectTypeOf<headless.WalletOption>().toEqualTypeOf<main.WalletOption>();
		expectTypeOf<headless.WalletDirectoryEntry>().toEqualTypeOf<main.WalletDirectoryEntry>();
		expectTypeOf<headless.Network>().toEqualTypeOf<main.Network>();
	});
});
