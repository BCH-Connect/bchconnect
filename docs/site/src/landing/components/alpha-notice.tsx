import { Banner } from "fumadocs-ui/components/banner";
import { NOTICE } from "../content";

export function AlphaNotice() {
	return (
		// Not sticky, auto height: the copy wraps on narrow screens, so it pushes the page down. `relative` keeps the absolute close button inside the bar.
		<Banner
			id="alpha-notice"
			changeLayout={false}
			height="auto"
			className="alpha-notice relative"
		>
			<p className="alpha-notice-text">
				<strong>{NOTICE.title}</strong> {NOTICE.body}
			</p>
		</Banner>
	);
}
