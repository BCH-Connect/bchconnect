// Inlined: a shadow-rooted component can't load an icon font or sprite from
// the host page.
//
// Path data from lucide-static 1.47.0 (ISC licensed: https://lucide.dev/license)

import { html, type SVGTemplateResult, svg, type TemplateResult } from "lit";

export type IconName =
	| "x"
	| "chevronLeft"
	| "check"
	| "arrowUpRight"
	| "rotateCcw"
	| "info"
	| "link"
	| "scanLine"
	| "wallet";

const PATHS: Readonly<Record<IconName, SVGTemplateResult>> = {
	x: svg`<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
	chevronLeft: svg`<path d="m15 18-6-6 6-6"/>`,
	check: svg`<path d="M20 6 9 17l-5-5"/>`,
	arrowUpRight: svg`<path d="M7 7h10v10"/><path d="M7 17 17 7"/>`,
	rotateCcw: svg`<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>`,
	info: svg`<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`,
	link: svg`<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
	scanLine: svg`<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>`,
	wallet: svg`<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>`,
};

// Lucide's 24-unit grid at stroke 2; 16px default matches the modal's other hairlines.
export function icon(name: IconName, size = 16): TemplateResult {
	return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
