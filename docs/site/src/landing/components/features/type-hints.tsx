import { Fragment, useEffect, useRef, useState } from "react";
import { prefersReducedMotion, useInView } from "../../hooks/use-in-view";
import { CodeWindow, k, s } from "./code-window";

/** What the editor shows on hover, before and after the protocol check narrows the session. */
const HINTS = [
	{
		id: "wide",
		label: "const session:",
		members: [
			"Session<WizardConnect>",
			"Session<WalletConnect>",
			"Session<CashConnect>",
			"null",
		],
	},
	{ id: "narrow", label: "const session:", members: ["Session<CashConnect>"] },
] as const;

type HintId = (typeof HINTS)[number]["id"];

const CYCLE_MS = 3200;

/** A hover target in the snippet: it shows its hint on hover or focus, and when the cycle reaches it. */
function Hover({
	id,
	active,
	onHold,
	children,
}: {
	readonly id: HintId;
	readonly active: HintId | null;
	readonly onHold: (id: HintId | null) => void;
	readonly children: string;
}) {
	const hint = HINTS.find((entry) => entry.id === id);
	return (
		<span
			className="hint-anchor"
			data-on={active === id}
			onPointerEnter={() => onHold(id)}
			onPointerLeave={() => onHold(null)}
		>
			{children}
			<span className="hint" role="tooltip">
				<span className="hint-label">{hint?.label}</span>{" "}
				{/* A union wraps only between its members, never inside one. */}
				{hint?.members.map((member, index) => (
					<Fragment key={member}>
						{index > 0 && " "}
						<span className="hint-member">
							{index > 0 && <span className="hint-pipe">| </span>}
							<span className={member === "null" ? "hint-null" : undefined}>
								{member}
							</span>
						</span>
					</Fragment>
				))}
			</span>
		</span>
	);
}

/** The session's type, wide until a protocol check narrows it, shown the way an editor does on hover. */
export function TypeHints() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const [cycled, setCycled] = useState<HintId>("wide");
	const [held, setHeld] = useState<HintId | null>(null);
	const [still, setStill] = useState(true);
	const active = held ?? (inView ? cycled : null);

	useEffect(() => setStill(prefersReducedMotion()), []);

	useEffect(() => {
		if (!inView || held !== null || still) return;
		const timer = window.setInterval(
			() => setCycled((current) => (current === "wide" ? "narrow" : "wide")),
			CYCLE_MS,
		);
		return () => window.clearInterval(timer);
	}, [inView, held, still]);

	return (
		<div ref={ref} className="hints">
			<CodeWindow file="session.ts">
				{k("const")}{" "}
				<Hover id="wide" active={active} onHold={setHeld}>
					session
				</Hover>{" "}
				= client.current;{"\n\n"}
				{k("if")} (session?.protocol === {s('"cashconnect"')}) {"{\n  "}
				<Hover id="narrow" active={active} onHold={setHeld}>
					session
				</Hover>
				.data
				{"\n}"}
			</CodeWindow>
		</div>
	);
}
