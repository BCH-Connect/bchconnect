import type { ProtocolId } from "@bchconnect/ui";
import type { CSSProperties } from "react";
import { PROTOCOLS } from "../content";

export type HubState = "idle" | "connecting" | "connected";

const WIDTH = 440;
const HEIGHT = 296;
const PLATE = 84;
const MARK = 44;
/** Where the three wires become one, just above the connect control. */
const JOIN = { x: 220, y: 256 } as const;
const TRUNK = `M ${JOIN.x} ${JOIN.y} V ${HEIGHT}`;

const PLATES: Readonly<Record<ProtocolId, { x: number; y: number }>> = {
	wizardconnect: { x: 220, y: 72 },
	"bch-wc2": { x: 84, y: 160 },
	cashconnect: { x: 356, y: 160 },
};

/** The ring's distance from the plate, kept even around the corners. */
const RING_GAP = 6;
const PLATE_RADIUS = 26;

/**
 * One half of the ring around a plate, from where the wire leaves it at the
 * bottom to the top, so the two halves draw out from the wire and meet.
 */
function ringHalf(x: number, y: number, side: 1 | -1): string {
	const half = PLATE / 2 + RING_GAP;
	const r = PLATE_RADIUS + RING_GAP;
	const sweep = side === 1 ? 0 : 1;
	const edge = x + side * half;
	const corner = x + side * (half - r);
	return [
		`M ${x} ${y + half}`,
		`H ${corner}`,
		`A ${r} ${r} 0 0 ${sweep} ${edge} ${y + half - r}`,
		`V ${y - half + r}`,
		`A ${r} ${r} 0 0 ${sweep} ${corner} ${y - half}`,
		`H ${x}`,
	].join(" ");
}

/**
 * From the middle of a plate down to the join, leaving it vertical so the
 * three read as one trunk. It starts under the plate, hidden by it.
 */
function wire(x: number, y: number): string {
	if (x === JOIN.x) return `M ${x} ${y} V ${JOIN.y}`;
	const bottom = y + PLATE / 2;
	return `M ${x} ${y} V ${bottom} C ${x} ${bottom + 48}, ${JOIN.x} ${JOIN.y - 40}, ${JOIN.x} ${JOIN.y}`;
}

/**
 * One wire in three layers: the resting line, the accent that draws along it
 * once it carries the session, and the signal that travels it.
 */
function Wire({ d }: { d: string }) {
	return (
		<>
			<path d={d} pathLength={1} className="hub-edge" />
			<path d={d} pathLength={1} className="hub-line" />
			<path d={d} pathLength={1} className="hub-lit" />
			<path d={d} pathLength={1} className="hub-signal" />
		</>
	);
}

interface ProtocolHubProps {
	readonly state: HubState;
	/** The protocol being connected over, or the one the session uses. */
	readonly active: ProtocolId | null;
}

export function ProtocolHub({ state, active }: ProtocolHubProps) {
	return (
		<svg
			className="hub"
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			fill="none"
			aria-hidden="true"
			data-state={state}
		>
			{PROTOCOLS.map((protocol, index) => {
				const { x, y } = PLATES[protocol.id];
				return (
					<g
						key={protocol.id}
						className="hub-route"
						data-id={protocol.id}
						data-active={protocol.id === active}
						style={{ "--index": index } as CSSProperties}
					>
						<Wire d={wire(x, y)} />
					</g>
				);
			})}

			<g className="hub-trunk">
				<Wire d={TRUNK} />
			</g>

			{PROTOCOLS.map((protocol, index) => {
				const { x, y } = PLATES[protocol.id];
				const box = {
					x: x - PLATE / 2,
					y: y - PLATE / 2,
					width: PLATE,
					height: PLATE,
					rx: PLATE_RADIUS,
				};
				return (
					<g
						key={protocol.id}
						className="hub-plate"
						data-id={protocol.id}
						data-active={protocol.id === active}
						style={{ "--index": index } as CSSProperties}
					>
						<text x={x} y={y - PLATE / 2 - 14} className="hub-label">
							{protocol.name}
						</text>
						<path
							d={ringHalf(x, y, 1)}
							pathLength={1}
							className="hub-plate-ring"
						/>
						<path
							d={ringHalf(x, y, -1)}
							pathLength={1}
							className="hub-plate-ring"
						/>
						{/* An HTML face: blur and box-shadow are not available to an SVG rect. */}
						<foreignObject
							x={box.x}
							y={box.y}
							width={PLATE}
							height={PLATE}
							className="hub-plate-frame"
						>
							<div className="hub-card" />
						</foreignObject>
						<image
							href={protocol.mark}
							x={x - MARK / 2}
							y={y - MARK / 2}
							width={MARK}
							height={MARK}
							className="hub-mark"
						/>
					</g>
				);
			})}
		</svg>
	);
}
