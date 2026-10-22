import { describe, expect, it } from "vitest";
import { bchconnectModal } from "../src/bchconnect-modal.ts";

describe("bchconnectModal", () => {
	it("should create the ui without a DOM", () => {
		expect(globalThis.document).toBeUndefined();
		expect(bchconnectModal({ toast: false }).connect).toBeTypeOf("function");
	});
});
