// A quiet, authored composition: three protocol marks as peers, joined by
// thin lines to one node (one client). Static and server-safe — it only
// references the mark images copied to /public/marks, never the package.
// Purely decorative; the protocols are named in text in the section below.

const NODE = { x: 210, y: 160 };
const PLATE_SIZE = 84;
const MARK_SIZE = 44;

const PLATES = [
	{ id: "wizardconnect", cx: 82, cy: 72, src: "/marks/wizardconnect.webp" },
	{ id: "walletconnect", cx: 338, cy: 72, src: "/marks/walletconnect.svg" },
	{ id: "cashconnect", cx: 210, cy: 272, src: "/marks/cashconnect.webp" },
] as const;

export function ProtocolGraph() {
	return (
		<svg
			className="landing-graph"
			viewBox="0 0 420 340"
			fill="none"
			aria-hidden="true"
		>
			{PLATES.map((plate) => (
				<line
					key={`line-${plate.id}`}
					x1={NODE.x}
					y1={NODE.y}
					x2={plate.cx}
					y2={plate.cy}
					stroke="var(--accent-foreground)"
					strokeOpacity="0.3"
					strokeWidth="1.5"
				/>
			))}
			<circle cx={NODE.x} cy={NODE.y} r="9" fill="var(--accent-foreground)" />
			{PLATES.map((plate) => (
				<g key={`plate-${plate.id}`}>
					<rect
						x={plate.cx - PLATE_SIZE / 2}
						y={plate.cy - PLATE_SIZE / 2}
						width={PLATE_SIZE}
						height={PLATE_SIZE}
						rx="20"
						fill="white"
						stroke="color-mix(in srgb, var(--accent-foreground) 16%, transparent)"
					/>
					<image
						href={plate.src}
						x={plate.cx - MARK_SIZE / 2}
						y={plate.cy - MARK_SIZE / 2}
						width={MARK_SIZE}
						height={MARK_SIZE}
					/>
				</g>
			))}
		</svg>
	);
}
