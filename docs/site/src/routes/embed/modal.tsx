import { createFileRoute } from "@tanstack/react-router";
import { ModalEmbed } from "@/landing/embed/modal-embed";

/** The connect modal alone, framed by the landing's interface preview. */
export const Route = createFileRoute("/embed/modal")({
	head: () => ({
		meta: [
			{ title: "Connect modal preview" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: ModalEmbed,
});
