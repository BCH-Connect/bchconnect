import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { DropWire } from "./components/drop-wire";
import { useConnectDemo } from "./hooks/use-connect-demo";
import { Features } from "./sections/features";
import { Footer } from "./sections/footer";
import { Hero } from "./sections/hero";
import "./styles/landing.css";
import "./styles/features.css";
import "./styles/footer.css";

export function Landing() {
	const base = baseOptions();
	const demo = useConnectDemo();

	return (
		<HomeLayout
			{...base}
			// Matches .landing-container, so the wordmark sits on the content's left edge.
			className="[--fd-layout-width:1208px]"
			nav={{ ...base.nav, transparentMode: "top" }}
			links={[{ text: "Docs", url: "/docs" }, ...(base.links ?? [])]}
		>
			<div className="landing">
				<div className="landing-light" aria-hidden="true" />
				<Hero demo={demo} />
				<Features session={null} />
				<DropWire connected={false} />
				<Footer />
			</div>
		</HomeLayout>
	);
}
