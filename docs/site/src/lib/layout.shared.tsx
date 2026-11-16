import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { GithubStars } from "@/components/github-stars";
import { VersionTag } from "@/components/version-tag";
import { Wordmark } from "@/components/wordmark";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: (
				<span className="inline-flex items-baseline gap-2 whitespace-nowrap">
					<Wordmark />
					<VersionTag />
				</span>
			),
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
