import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { StartPanel } from "../components/start-panel";
import type { FooterLink } from "../content";
import { CLOSE, FOOTER } from "../content";

function FooterAnchor({ link }: { readonly link: FooterLink }) {
	if ("doc" in link) {
		return (
			<Link
				to="/docs/$"
				// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
				params={{ _splat: link.doc }}
				className="footer-link"
			>
				{link.label}
			</Link>
		);
	}
	const external = link.href.startsWith("http");
	return (
		<a
			href={link.href}
			className="footer-link"
			{...(external && { target: "_blank", rel: "noreferrer noopener" })}
		>
			{link.label}
		</a>
	);
}

export function Footer() {
	return (
		<footer className="footer">
			<section
				className="footer-close landing-container"
				aria-labelledby="close-title"
			>
				<h2 id="close-title" className="section-title footer-close-title">
					{CLOSE.title}
				</h2>
				<p className="section-lede footer-close-lede">{CLOSE.lede}</p>
				<div className="footer-close-actions">
					<Link
						to="/docs/$"
						// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
						params={{ _splat: "" }}
						className="landing-action landing-action--primary"
					>
						{CLOSE.action}
						<ArrowRight aria-hidden="true" />
					</Link>
					<StartPanel />
				</div>
			</section>

			<nav className="footer-nav landing-container" aria-label="Footer">
				<div className="footer-brand">
					<Wordmark />
					<p>{FOOTER.tagline}</p>
				</div>
				{FOOTER.groups.map((group) => (
					<div key={group.title} className="footer-group">
						<h3 className="footer-group-title">{group.title}</h3>
						<ul>
							{group.links.map((link) => (
								<li key={link.label}>
									<FooterAnchor link={link} />
								</li>
							))}
						</ul>
					</div>
				))}
			</nav>

			<div className="footer-base landing-container">
				<span>{FOOTER.copyright}</span>
				<span>{FOOTER.license}</span>
			</div>

			<div className="footer-mark" aria-hidden="true">
				<span>{FOOTER.mark}</span>
			</div>
		</footer>
	);
}
