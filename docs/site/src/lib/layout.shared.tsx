import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { GithubStars } from "@/components/github-stars";
import { Wordmark } from "@/components/wordmark";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: <Wordmark />,
		},
		links: [
			{
				type: "custom",
				secondary: true,
				children: <GithubStars />,
			},
		],
	};
}
