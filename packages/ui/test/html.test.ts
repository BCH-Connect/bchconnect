import { describe, expect, it } from "vitest";
import { escapeHtml, safeHref } from "../src/html.ts";

describe("escapeHtml", () => {
	it("should escape every character that can end text or an attribute", () => {
		expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
			"&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
		);
	});
});

describe("safeHref", () => {
	it.each([
		"wc:f351dbe7@2?relay-protocol=irn&symKey=b200",
		"WIZ://%3FP%3DLDT6EGH3",
		"bch-cc-v1:f40b68af?relay=wss%3A%2F%2Fnostr.infra.cash",
		"https://cashonize.com",
		"/relative/path",
	])("should keep %s", (url) => {
		expect(safeHref(url)).toBe(url);
	});

	it.each([
		"javascript:alert(1)",
		"JavaScript:alert(1)",
		" javascript:alert(1)",
		"java\tscript:alert(1)",
		"java\nscript:alert(1)",
		"\u0000javascript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"vbscript:msgbox(1)",
	])("should refuse %j", (url) => {
		expect(safeHref(url)).toBeNull();
	});
});
