import { describe, expect, it } from "vitest";
import { cookieStorage, localStorage, memory } from "../src/index.js";

describe("package entry", () => {
	it("should export the storage adapters", () => {
		expect(cookieStorage).toBeTypeOf("function");
		expect(localStorage).toBeTypeOf("function");
		expect(memory).toBeTypeOf("function");
	});
});
