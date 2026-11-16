import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GithubMark } from "@/components/github-mark";
import { repoUrl } from "@/lib/shared";
import { HERO } from "../content";
import { StartPanel } from "./start-panel";

export function HeroCopy() {
	return (
		<div className="hero-copy">
			<h1 className="hero-title">{HERO.headline}</h1>
			<p className="hero-lede">{HERO.lede}</p>
			<div className="hero-actions">
				<Link
					to="/docs/$"
					// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
					params={{ _splat: "" }}
					className="landing-action landing-action--primary"
				>
					{HERO.primaryAction}
					<ArrowRight aria-hidden="true" />
				</Link>
				<a
					href={repoUrl}
					target="_blank"
					rel="noreferrer noopener"
					className="landing-action landing-action--secondary"
				>
					<GithubMark />
					{HERO.secondaryAction}
				</a>
			</div>
			<StartPanel />
		</div>
	);
}
