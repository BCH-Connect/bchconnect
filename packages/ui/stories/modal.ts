// Shared `<bchc-modal>` story wiring: one render for every modal stories
// file, so args reach the element the same way everywhere.

import { html, nothing } from "lit";
import { action } from "storybook/actions";
import { expect, type Mock } from "storybook/test";
import { resolveMessages, resolveMode } from "../.storybook/preview.ts";
import { BCHC_MESSAGES_EN, type BchcMessages } from "../src/messages.ts";
import type { FailureReason, ModalView } from "../src/state.ts";
import type { ThemeArgs } from "./theme.ts";

// Mirrors the private `FAILURE_MESSAGE_KEYS` in src/modal.ts: which catalogue
// keys back each failure reason's title and detail.
const FAILURE_COPY_KEYS: Readonly<
	Record<
		FailureReason,
		{ readonly title: keyof BchcMessages; readonly detail: keyof BchcMessages }
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

export interface ModalStoryArgs extends ThemeArgs {
	readonly view: ModalView;
	readonly messages?: Partial<BchcMessages> | null;
}

export type ModalElement = HTMLElement & {
	view: ModalView | null;
	messages: Partial<BchcMessages> | null;
};

/** The rendered `<bchc-modal>` in a story's canvas; throws if it never painted. */
export function modalHost(canvasElement: HTMLElement): ModalElement {
	const host = canvasElement.querySelector("bchc-modal");
	if (!(host instanceof HTMLElement))
		throw new Error("bchc-modal did not render");
	return host as ModalElement;
}

/** The modal's shadow root, for querying its rendered markup. */
export function modalShadow(canvasElement: HTMLElement): ShadowRoot {
	const shadow = modalHost(canvasElement).shadowRoot;
	if (shadow === null) throw new Error("bchc-modal shadow root missing");
	return shadow;
}

/** Asserts the failure face's title and detail against a catalogue's own copy for `reason`. */
export function expectFailureCopy(
	canvasElement: HTMLElement,
	reason: FailureReason,
	messages: BchcMessages = BCHC_MESSAGES_EN,
): void {
	const shadow = modalShadow(canvasElement);
	const keys = FAILURE_COPY_KEYS[reason];
	const title = shadow.querySelector(".status-title");
	const detail = shadow.querySelector(".status-detail");
	expect(title?.textContent).toBe(messages[keys.title]);
	expect(detail?.textContent).toBe(messages[keys.detail]);
}

/** The detail of a spy's first observed call, once it has been seen. */
export function detailOf<T>(spy: Mock<(event: Event) => void>): T {
	const call = spy.mock.calls[0];
	if (call === undefined) throw new Error("event listener was not called");
	return (call[0] as CustomEvent<T>).detail;
}

/** Wires theme args and a view onto `<bchc-modal>`; every modal story shares this. */
export const modalRender = (
	args: ModalStoryArgs,
	context: { globals: { readonly mode?: unknown; readonly locale?: unknown } },
) => html`
	<bchc-modal
		data-bchc-accent=${args.accent ?? nothing}
		data-bchc-neutral=${args.neutral ?? nothing}
		data-bchc-radius=${args.radius ?? nothing}
		data-bchc-font=${args.font ?? nothing}
		data-bchc-blur=${args.backdropBlur ?? nothing}
		data-bchc-mode=${resolveMode(context.globals)}
		.view=${args.view}
		.messages=${args.messages ?? resolveMessages(context.globals)}
		@bchc-protocol=${action("bchc-protocol")}
		@bchc-screen=${action("bchc-screen")}
		@bchc-close=${action("bchc-close")}
		@bchc-retry=${action("bchc-retry")}
	></bchc-modal>
`;
