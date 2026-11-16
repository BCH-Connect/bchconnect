import { ChevronDown } from "lucide-react";
import type { CSSProperties, ToggleEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
	AGENT_PROMPT,
	AGENT_PROMPT_BODY,
	AGENT_PROMPT_TITLE,
	START,
} from "../content";
import { useRoving } from "../hooks/use-roving";
import { CopyButton } from "./copy-button";

type Tab = "install" | "prompt" | "skill";

const TABS: readonly Tab[] = ["install", "prompt", "skill"];

/** The tabs that show a shell command, with the label of their copy button. */
const COMMANDS = {
	install: { command: START.install, copyLabel: START.copyInstall },
	skill: { command: START.skill, copyLabel: START.copySkill },
} as const;

export function StartPanel() {
	const [tab, setTab] = useState<Tab>("install");
	const panel = useRef<HTMLDivElement>(null);
	const closeOnScroll = useRef<AbortController | null>(null);
	const panelId = useId();
	const popoverId = useId();
	const tabs = useRoving(TABS, tab, setTab);

	useEffect(() => () => closeOnScroll.current?.abort(), []);

	/** Docks the open popover under the panel; phones keep the browser's centring. */
	function place(event: ToggleEvent<HTMLDivElement>) {
		closeOnScroll.current?.abort();
		if (event.newState !== "open" || panel.current === null) return;
		if (!window.matchMedia("(min-width: 640px)").matches) return;
		const box = panel.current.getBoundingClientRect();
		const popover = event.currentTarget;
		popover.style.margin = "0";
		popover.style.left = `${box.left}px`;
		popover.style.top = `${box.bottom + 8}px`;
		popover.style.width = `${box.width}px`;
		// Fixed to the viewport, it would drift away from the panel on scroll.
		closeOnScroll.current = new AbortController();
		window.addEventListener("scroll", () => popover.hidePopover(), {
			once: true,
			passive: true,
			signal: closeOnScroll.current.signal,
		});
	}

	return (
		<div
			ref={panel}
			className="start-panel"
			style={
				{ "--tab": TABS.indexOf(tab), "--tabs": TABS.length } as CSSProperties
			}
		>
			<div
				role="tablist"
				aria-label={START.label}
				className="start-switch"
				onKeyDown={tabs.onKeyDown}
			>
				<span className="start-thumb" aria-hidden="true" />
				{TABS.map((id) => (
					<button
						key={id}
						{...tabs.item(id)}
						role="tab"
						aria-selected={id === tab}
						aria-controls={panelId}
						className="start-segment"
					>
						{START.tabs[id]}
					</button>
				))}
			</div>

			<div id={panelId} role="tabpanel" className="start-row" key={tab}>
				{tab !== "prompt" ? (
					<>
						<code className="start-command">
							<span className="start-sigil" aria-hidden="true">
								$
							</span>
							{COMMANDS[tab].command}
						</code>
						<CopyButton
							text={COMMANDS[tab].command}
							label={COMMANDS[tab].copyLabel}
							copiedLabel={START.copied}
							className="start-pill"
						>
							{START.copy}
						</CopyButton>
					</>
				) : (
					<>
						<button
							type="button"
							className="start-view"
							popoverTarget={popoverId}
						>
							{START.promptLabel}
							<ChevronDown aria-hidden="true" />
						</button>
						<CopyButton
							text={AGENT_PROMPT}
							label={START.copyPrompt}
							copiedLabel={START.copied}
							className="start-pill"
						>
							{START.copy}
						</CopyButton>
					</>
				)}
			</div>

			<div
				id={popoverId}
				popover="auto"
				className="start-popover"
				onToggle={place}
			>
				<p className="start-popover-title">{AGENT_PROMPT_TITLE}</p>
				<p className="start-popover-body">{AGENT_PROMPT_BODY}</p>
				<div className="start-popover-foot">
					<CopyButton
						text={AGENT_PROMPT}
						label={START.copyPrompt}
						copiedLabel={START.copied}
						className="start-pill"
					>
						{START.copyPrompt}
					</CopyButton>
				</div>
			</div>
		</div>
	);
}
