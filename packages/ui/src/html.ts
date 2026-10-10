export function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[character] ?? character,
	);
}

const SCRIPT_SCHEMES = new Set(["javascript", "data", "vbscript"]);

// Denylist, not an allowlist: pairing links use custom schemes (wc:, WIZ://,
// bch-cc-v1:), so only script-capable schemes are refused.
export function safeHref(url: string): string | null {
	const scheme = /^([a-z][a-z\d+.-]*):/i.exec(
		url.replace(/[\s\p{Cc}]/gu, ""),
	)?.[1];
	return scheme !== undefined && SCRIPT_SCHEMES.has(scheme.toLowerCase())
		? null
		: url;
}
