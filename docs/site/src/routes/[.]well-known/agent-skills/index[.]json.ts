import { createFileRoute } from "@tanstack/react-router";
import {
	DISCOVERY_SCHEMA,
	SKILL_PATH,
	skill,
	skillDigest,
} from "@/agents/skill";

// Lets `npx skills add https://bchconnect.dev` find and verify the skill.
export const Route = createFileRoute("/.well-known/agent-skills/index.json")({
	server: {
		handlers: {
			GET: async () =>
				Response.json({
					// biome-ignore lint/style/useNamingConvention: named by the discovery schema.
					$schema: DISCOVERY_SCHEMA,
					skills: [
						{
							name: skill.name,
							type: "skill-md",
							description: skill.description,
							url: SKILL_PATH,
							digest: await skillDigest(),
						},
					],
				}),
		},
	},
});
