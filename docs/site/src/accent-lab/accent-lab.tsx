// TEMPORARY swatch rail for trying each accent, with its paired neutral, on
// every page of the site. Shown in dev, or anywhere with `?accents` in the URL.

import { useEffect, useState } from "react";
import {
	applyLabAccent,
	LAB_ACCENTS,
	LAB_ATTRIBUTE,
	LAB_NEUTRAL,
	type LabAccent,
	labAccent,
	labSwatch,
	storedLabAccent,
} from "./state";
import "./accent-lab.generated.css";
import "./accent-lab.css";

function isTyping(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
	);
}

export function AccentLab() {
	const [enabled, setEnabled] = useState(false);
	const [accent, setAccent] = useState<LabAccent>("green");
	const [open, setOpen] = useState(true);

	useEffect(() => {
		const wanted =
			import.meta.env.DEV ||
			new URLSearchParams(window.location.search).has("accents");
		if (!wanted) return;
		const initial = storedLabAccent() ?? "green";
		applyLabAccent(initial);
		setAccent(initial);
		// On a phone the rail would cover the hero's controls, so it starts folded.
		setOpen(window.matchMedia("(min-width: 481px)").matches);
		setEnabled(true);
		return () => document.documentElement.removeAttribute(LAB_ATTRIBUTE);
	}, []);

	useEffect(() => {
		if (!enabled) return;
		// `[` and `]` step through the accents, for quick side-by-side reading.
		const onKey = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTyping(event.target)) return;
			if (event.key !== "[" && event.key !== "]") return;
			const step = event.key === "]" ? 1 : -1;
			const index = LAB_ACCENTS.indexOf(labAccent());
			const next =
				LAB_ACCENTS[(index + step + LAB_ACCENTS.length) % LAB_ACCENTS.length];
			if (next === undefined) return;
			applyLabAccent(next);
			setAccent(next);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enabled]);

	if (!enabled) return null;

	const pick = (next: LabAccent) => {
		applyLabAccent(next);
		setAccent(next);
	};

	return (
		<div className="accent-lab" data-open={open}>
			<button
				type="button"
				className="accent-lab-toggle"
				aria-expanded={open}
				aria-label={open ? "Hide accent swatches" : "Show accent swatches"}
				onClick={() => setOpen(!open)}
			>
				<span
					className="accent-lab-dot"
					style={{ background: labSwatch(accent) }}
				/>
			</button>
			{open && (
				<>
					<fieldset className="accent-lab-swatches">
						<legend className="sr-only">Landing accent</legend>
						{LAB_ACCENTS.map((option) => (
							<label
								key={option}
								className="accent-lab-swatch"
								title={`${option} · ${LAB_NEUTRAL[option]}`}
							>
								<input
									type="radio"
									name="accent-lab"
									value={option}
									checked={accent === option}
									onChange={() => pick(option)}
									aria-label={`${option} with ${LAB_NEUTRAL[option]} neutral`}
								/>
								<span style={{ background: labSwatch(option) }} />
							</label>
						))}
					</fieldset>
					<p className="accent-lab-name" aria-live="polite">
						{accent}
						<span> · {LAB_NEUTRAL[accent]}</span>
					</p>
				</>
			)}
		</div>
	);
}
