import type { ProtocolId } from "@bchconnect/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useState } from "react";
import { Frameworks } from "../components/features/frameworks";
import type { InterfaceView } from "../components/features/interface-stage";
import { InterfaceStage, VIEWS } from "../components/features/interface-stage";
import { ProtocolConfig } from "../components/features/protocol-config";
import { TypeHints } from "../components/features/type-hints";
import { FEATURES } from "../content";
import { useRoving } from "../hooks/use-roving";

/** Feeds the pointer position to the box's rim light as `--px` and `--py`. */
function follow(event: PointerEvent<HTMLElement>) {
	const box = event.currentTarget;
	const rect = box.getBoundingClientRect();
	box.style.setProperty("--px", `${event.clientX - rect.left}px`);
	box.style.setProperty("--py", `${event.clientY - rect.top}px`);
}

interface RowProps {
	readonly id: string;
	/** Which side the box sits on; rows alternate. */
	readonly box: "left" | "right";
	readonly title: string;
	readonly text: ReactNode;
	readonly visual: ReactNode;
	/** The visual is a code window, which is glass on its own. */
	readonly code?: boolean;
	/** The box is where the hero's drop wire ends. */
	readonly wireEnd?: boolean;
}

function Row({
	id,
	box,
	title,
	text,
	visual,
	code = false,
	wireEnd = false,
}: RowProps) {
	return (
		<article
			className="feature"
			data-id={id}
			data-box={box}
			aria-labelledby={`feature-${id}`}
		>
			<div className="feature-text">
				<h3 id={`feature-${id}`} className="feature-title">
					{title}
				</h3>
				{text}
			</div>
			<div
				className={`feature-box feature-box--${id}${code ? " feature-box--code" : ""}`}
				data-wire={wireEnd ? "end" : undefined}
				onPointerMove={follow}
			>
				{visual}
			</div>
		</article>
	);
}

interface FeaturesProps {
	/** The protocol of the hero's demo session, so the protocols box shows the same session. */
	readonly session: ProtocolId | null;
}

export function Features({ session }: FeaturesProps) {
	const [view, setView] = useState<InterfaceView>("builtIn");
	const roving = useRoving(VIEWS, view, setView);

	return (
		<section
			className="features landing-container"
			aria-labelledby="features-title"
		>
			<header className="features-intro">
				<h2 id="features-title" className="section-title">
					{FEATURES.title}
				</h2>
				<p className="section-lede">{FEATURES.lede}</p>
			</header>

			<Row
				id="protocols"
				box="right"
				title={FEATURES.protocols.title}
				text={
					<>
						<p className="feature-body">{FEATURES.protocols.body}</p>
						<p className="feature-detail">{FEATURES.protocols.detail}</p>
						<Link
							to="/docs/$"
							// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
							params={{ _splat: "concepts/protocols" }}
							className="feature-link"
						>
							{FEATURES.protocols.link}
							<ArrowRight aria-hidden="true" />
						</Link>
					</>
				}
				visual={<ProtocolConfig session={session} />}
				code
				wireEnd
			/>

			<Row
				id="interface"
				box="left"
				title={FEATURES.interface.title}
				text={
					<>
						{/* Both texts share one cell, so the row keeps the taller one's height. */}
						<div className="feature-swap">
							{VIEWS.map((id) => (
								<p
									key={id}
									className="feature-body"
									data-shown={view === id}
									aria-hidden={view !== id}
								>
									{FEATURES.interface[id]}
								</p>
							))}
						</div>
						<div
							role="tablist"
							aria-label={FEATURES.interface.title}
							className="segmented segmented--interface"
							onKeyDown={roving.onKeyDown}
							style={
								{
									"--tabs": VIEWS.length,
									"--tab": VIEWS.indexOf(view),
								} as CSSProperties
							}
						>
							<span className="segmented-thumb" aria-hidden="true" />
							{VIEWS.map((id) => (
								<button
									key={id}
									{...roving.item(id)}
									role="tab"
									aria-selected={view === id}
									aria-controls="interface-stage"
									className="segmented-option"
								>
									{FEATURES.interface.tabs[id]}
								</button>
							))}
						</div>
					</>
				}
				visual={
					<div id="interface-stage" role="tabpanel" className="stage-panel">
						<InterfaceStage view={view} />
					</div>
				}
			/>

			<Row
				id="types"
				box="right"
				title={FEATURES.types.title}
				text={<p className="feature-body">{FEATURES.types.body}</p>}
				visual={<TypeHints />}
				code
			/>

			<Row
				id="frameworks"
				box="left"
				title={FEATURES.frameworks.title}
				text={<p className="feature-body">{FEATURES.frameworks.body}</p>}
				visual={<Frameworks />}
				code
			/>
		</section>
	);
}
