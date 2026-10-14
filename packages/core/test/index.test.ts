import { describe, expect, it } from "vitest";
import { localStorage, memory } from "../src/index.js";

describe("package entry", () => {
	it("should export the storage adapters", () => {
		expect(localStorage).toBeTypeOf("function");
		expect(memory).toBeTypeOf("function");
	});
});
