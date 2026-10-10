import { describe, expectTypeOf, it } from "vitest";
import type { ModalScreen, ProtocolId } from "../src/index.ts";

describe("element events", () => {
	it("should type each modal event's detail", () => {
		const modal = document.createElement("bchc-modal");
		modal.addEventListener("bchc-protocol", (event) => {
			expectTypeOf(event.detail.protocol).toEqualTypeOf<ProtocolId>();
		});
		modal.addEventListener("bchc-screen", (event) => {
			expectTypeOf(event.detail.screen).toEqualTypeOf<ModalScreen>();
		});
		modal.addEventListener("bchc-close", (event) => {
			expectTypeOf(event).toEqualTypeOf<CustomEvent<void>>();
		});
		modal.addEventListener("bchc-retry", (event) => {
			expectTypeOf(event).toEqualTypeOf<CustomEvent<void>>();
		});
	});

	it("should type the toast's dismiss event", () => {
		const toast = document.createElement("bchc-toast");
		toast.addEventListener("bchc-dismiss", (event) => {
			expectTypeOf(event).toEqualTypeOf<CustomEvent<void>>();
		});
	});

	it("should type events heard on an ancestor, since they bubble out of the shadow root", () => {
		document.body.addEventListener("bchc-close", (event) => {
			expectTypeOf(event).toEqualTypeOf<CustomEvent<void>>();
		});
	});
});
