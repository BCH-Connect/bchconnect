import { createGetUrl } from "fumadocs-core/source";

export const appName = "BCH Connect";
export const docsRoute = "/docs";
export const docsImageRoute = "/og/docs";

export const gitConfig = {
	user: "BCH-Connect",
	repo: "bchconnect",
	branch: "main",
	/** Content directory relative to the repository root. */
	contentDir: "docs/site/content/docs",
};

const getDocsUrl = createGetUrl(docsRoute);

export function getPageMarkdownUrl(page: {
	slugs: string[];
	locale?: string | undefined;
}) {
	const segments = [...page.slugs];
	if (segments.length === 0) {
		segments.push("index.md");
	} else {
		segments[segments.length - 1] += ".md";
	}

	return { segments, url: getDocsUrl(segments, page.locale) };
}

/** @returns page slugs */
export function decodeMarkdownUrl(segments: string[]) {
	if (segments.length === 0) return [];

	const out = [...segments];
	const last = out.length - 1;
	out[last] = (out[last] ?? "").replace(/\.md$/, "");
	if (out.length === 1 && out[0] === "index") out.pop();
	return out;
}
