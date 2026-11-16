// The agent skill: one Markdown file, served as-is at SKILL_PATH and listed in
// the Agent Skills discovery index so `npx skills add <site>` can install it.

import source from "./SKILL.md?raw";

/** Where the skill is served, relative to the site root. */
export const SKILL_PATH = "/SKILL.md";

/** The exact bytes served; the discovery digest is computed over these. */
export const SKILL_BYTES = new TextEncoder().encode(source);

/** Agent Skills discovery index, schema v0.2.0. */
export const DISCOVERY_SCHEMA =
	"https://schemas.agentskills.io/discovery/0.2.0/schema.json";

function frontmatterField(field: string): string {
	const match = source.match(new RegExp(`^${field}: (.+)$`, "m"));
	if (!match?.[1]) throw new Error(`SKILL.md has no "${field}" field`);
	return match[1].trim();
}

export const skill = {
	name: frontmatterField("name"),
	description: frontmatterField("description"),
};

/** `sha256:<hex>` of SKILL_BYTES; installers reject the skill on a mismatch. */
export async function skillDigest(): Promise<string> {
	const hash = new Uint8Array(
		await crypto.subtle.digest("SHA-256", SKILL_BYTES),
	);
	const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0"));
	return `sha256:${hex.join("")}`;
}
