import { Banner } from "fumadocs-ui/components/banner";
import { NOTICE } from "../content";

export function AlphaNotice() {
	return (
		// Not sticky, auto height: the copy wraps on narrow screens, so it pushes the page down. `static` overrides Banner's default sticky positioning; omitting `id` makes it non-dismissible without localStorage.
		<Banner changeLayout={false} height="auto" className="alpha-notice static">
			<p className="alpha-notice-text">
				<strong>{NOTICE.title}</strong> {NOTICE.body}
			</p>
		</Banner>
	);
}
