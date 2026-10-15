import { describe, expect, it } from "vitest";
import {
	cookieStorage,
	cookieToInitialState,
	localStorage,
	memory,
} from "../src/index.js";

describe("package entry", () => {
	it("should export the storage adapters and the cookie reader", () => {
		expect(cookieStorage).toBeTypeOf("function");
		expect(cookieToInitialState).toBeTypeOf("function");
		expect(localStorage).toBeTypeOf("function");
		expect(memory).toBeTypeOf("function");
	});
});
