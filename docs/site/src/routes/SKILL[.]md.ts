import { createFileRoute } from "@tanstack/react-router";
import { SKILL_BYTES } from "@/agents/skill";

export const Route = createFileRoute("/SKILL.md")({
	server: {
		handlers: {
			GET: () =>
				new Response(SKILL_BYTES, {
					headers: { "Content-Type": "text/markdown; charset=utf-8" },
				}),
		},
	},
});
