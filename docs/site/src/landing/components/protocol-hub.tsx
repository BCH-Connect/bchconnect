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

/** WizardConnect crowns the arch; the other two sit level on either side. */
const PLATES: Readonly<Record<ProtocolId, { x: number; y: number }>> = {
	wizardconnect: { x: 220, y: 72 },
	walletconnect: { x: 84, y: 160 },
	cashconnect: { x: 356, y: 160 },
};

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

/**
 * Three protocols, one wire each, joined into a single trunk that runs into
 * the connect control below.
 */
export function ProtocolHub({ state, active }: ProtocolHubProps) {
	return (
		<svg
			className="hub"
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			fill="none"
			aria-hidden="true"
			data-state={state}
		>
			<defs>
				<linearGradient id="hub-plate-fill" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" className="hub-plate-top" />
					<stop offset="1" className="hub-plate-bottom" />
				</linearGradient>
			</defs>

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
					rx: 26,
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
						<rect {...box} className="hub-plate-ring" />
						<rect {...box} className="hub-plate-face" />
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
