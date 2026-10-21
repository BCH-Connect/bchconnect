// The code tile's changing faces: the caption under it, the copy button and the failure face.

import { html, nothing, svg, type TemplateResult } from "lit";
import { icon } from "./icons.ts";
import type { BchcMessages } from "./messages.ts";
import type { FailureReason, ModalView } from "./state.ts";

/** @internal */
export type CaptionKind = "initiating" | "hint" | "scan" | "none";

// The catalogue's copy keys: `lang` is a tag, and the function keys need a value.
/** @internal */
export type MessageTextKey = Exclude<
	{
		[K in keyof BchcMessages]: BchcMessages[K] extends string ? K : never;
	}[keyof BchcMessages],
	"lang"
>;

// Exhaustive on FailureReason, so a new reason fails typecheck here first.
const FAILURE_MESSAGE_KEYS: Readonly<
	Record<
		FailureReason,
		{ readonly title: MessageTextKey; readonly detail: MessageTextKey }
	>
> = {
	rejected: { title: "rejectedTitle", detail: "rejectedDetail" },
	timeout: { title: "timeoutTitle", detail: "timeoutDetail" },
	aborted: { title: "abortedTitle", detail: "abortedDetail" },
	transport: { title: "transportTitle", detail: "transportDetail" },
	"network-mismatch": {
		title: "networkMismatchTitle",
		detail: "networkMismatchDetail",
	},
	unsupported: { title: "unsupportedTitle", detail: "unsupportedDetail" },
};

/** Which caption the phase calls for. @internal */
export function captionKind(view: ModalView, linkFailed: boolean): CaptionKind {
	switch (view.phase.kind) {
		case "initiating":
			return "initiating";
		case "awaiting-approval":
			return linkFailed ? "hint" : "scan";
		default:
			return "none";
	}
}

/** The copy button's contents. @internal */
export function copyFace(
	messages: BchcMessages,
	copied: boolean,
): TemplateResult {
	return copied
		? html`${icon("check")}${messages.linkCopied}`
		: html`${icon("link")}${messages.copyLink}`;
}

/** The caption's contents. @internal */
export function caption(messages: BchcMessages, kind: CaptionKind): unknown {
	switch (kind) {
		case "initiating":
			return html`<span class="dots"><i></i><i></i><i></i></span><span class="caption-text">${messages.initiating}</span>`;
		case "hint":
			return html`${icon("info")}<span class="caption-text">${messages.linkFailed}</span>`;
		case "scan":
			return html`${icon("scanLine")}<span class="caption-text">${messages.scan}</span>`;
		default:
			return nothing;
	}
}

const RING_DOTS = 14;

/** Each dot carries its index (`--i`) so the stylesheet can animate them in order. */
const RING = html`<svg class="ring" width="96" height="96" viewBox="0 0 96 96" fill="currentColor" aria-hidden="true">${Array.from(
	{ length: RING_DOTS },
	(_, index) => {
		const angle = (index / RING_DOTS) * Math.PI * 2 - Math.PI / 2;
		const x = (48 + Math.cos(angle) * 41).toFixed(2);
		const y = (48 + Math.sin(angle) * 41).toFixed(2);
		return svg`<circle cx=${x} cy=${y} r="3.6" style="--i:${index}"/>`;
	},
)}</svg>`;

/** The failure face for `reason`, or nothing. @internal */
export function statusFace(
	messages: BchcMessages,
	reason: FailureReason | null,
): unknown {
	if (reason === null) return nothing;
	const keys = FAILURE_MESSAGE_KEYS[reason];
	return html`
		<span class="status-mark">${RING}${icon("x", 34)}</span>
		<strong class="status-title">${messages[keys.title]}</strong>
		<p class="status-detail">${messages[keys.detail]}</p>
		<button class="button primary pill retry" type="button" data-act="retry">${icon("rotateCcw", 15)}${messages.tryAgain}</button>
	`;
}
