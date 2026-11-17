import { TemplateSchema } from "@cashconnect-js/core/templates";
import { describe, expect, it } from "vitest";
import { sendTemplate, sendTokensTemplate } from "../src/templates.js";

describe("sendTemplate", () => {
	it("should keep every field through the SDK's template schema", () => {
		expect(TemplateSchema.parse(sendTemplate)).toMatchObject(sendTemplate);
	});
});

describe("sendTokensTemplate", () => {
	it("should keep every field through the SDK's template schema", () => {
		expect(TemplateSchema.parse(sendTokensTemplate)).toMatchObject(
			sendTokensTemplate,
		);
	});
});
