import { describe, expect, it } from "vitest";
import {
	cookieStorage,
	cookieToInitialState,
	localStorage,
	memory,
	parseExtendedJson,
	signMessage,
	signTransaction,
	stringifyExtendedJson,
} from "../src/index.js";

describe("package entry", () => {
	it("should export the storage adapters and the cookie reader", () => {
		expect(cookieStorage).toBeTypeOf("function");
		expect(cookieToInitialState).toBeTypeOf("function");
		expect(localStorage).toBeTypeOf("function");
		expect(memory).toBeTypeOf("function");
	});

	it("should export the extended JSON codec", () => {
		expect(parseExtendedJson).toBeTypeOf("function");
		expect(stringifyExtendedJson).toBeTypeOf("function");
	});

	it("should export the signing helpers", () => {
		expect(signMessage).toBeTypeOf("function");
		expect(signTransaction).toBeTypeOf("function");
	});
});
