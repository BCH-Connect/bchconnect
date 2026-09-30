import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { Footer } from "./sections/footer";
import { Hero } from "./sections/hero";
import "./styles/landing.css";

export function Landing() {
	const base = baseOptions();

	return (
		<HomeLayout
			{...base}
			// Matches .landing-container, so the wordmark sits on the content's left edge.
			className="[--fd-layout-width:1208px]"
			// The header stays clear at the top, so the page's light runs up behind it.
			nav={{ ...base.nav, transparentMode: "top" }}
			links={[
				{ text: "Docs", url: "/docs" },
				{ text: "Concepts", url: "/docs/concepts" },
				...(base.links ?? []),
			]}
		>
			<div className="landing">
				<div className="landing-light" aria-hidden="true" />
				<Hero />
				<Footer />
			</div>
		</HomeLayout>
	);
}
