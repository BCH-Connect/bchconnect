import uiPackage from "@bchconnect/ui/package.json";
import type { CSSProperties } from "react";

// The packages version as one fixed Changesets group, so any member speaks for all.
const version = uiPackage.version;
const released = version !== "0.0.0";
const glyphs = `v${version}`.split("");

export function VersionTag() {
	return (
		<span className="version-tag">
			<span className="sr-only">
				{` version ${version}${released ? "" : ", unreleased"}`}
			</span>
			<span aria-hidden="true">
				{glyphs.map((glyph, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the glyphs are a fixed string
						key={i}
						className="version-tag-glyph"
						style={{ "--i": i } as CSSProperties}
					>
						{glyph}
					</span>
				))}
			</span>
		</span>
	);
}
