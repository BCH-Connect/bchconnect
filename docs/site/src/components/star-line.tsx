import { Star } from "lucide-react";
import { repoUrl } from "@/lib/shared";

export function StarLine() {
	return (
		<p className="mt-12 border-fd-border border-t pt-4 text-fd-muted-foreground text-sm">
			<Star className="-mt-0.5 me-1.5 inline size-3.5" aria-hidden="true" />
			BCH Connect is open source. If these docs helped you,{" "}
			<a
				href={repoUrl}
				target="_blank"
				rel="noreferrer noopener"
				className="text-fd-foreground underline decoration-(--accent-6) decoration-[1.5px] underline-offset-3 hover:decoration-current"
			>
				star it on GitHub
			</a>
			.
		</p>
	);
}
