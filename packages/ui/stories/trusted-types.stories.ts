// Each story renders the elements inside an iframe whose own CSP enforces
// Trusted Types: the Storybook preview itself writes HTML strings, so the
// policy can't sit on the page around it.

import { html } from "lit";
import { expect, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { CONNECTED_WALLET, viewFor } from "./fixtures.ts";

type Elements = typeof import("../src/index.ts");

type Sandbox = Window & {
	__ui?: Elements;
	__violations?: string[];
};

// Lit creates its policy as `lit-html`; no other policy name is allowed.
const CSP = "require-trusted-types-for 'script'; trusted-types lit-html";

// The iframe imports the source through the dev server, getting its own realm.
const ENTRY = new URL("../src/index.ts", import.meta.url).href;

const SANDBOX_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<script>
window.__violations = [];
document.addEventListener("securitypolicyviolation", (event) => {
	window.__violations.push(event.violatedDirective + ": " + event.sample);
});
window.addEventListener("error", (event) => {
	window.__violations.push("error: " + event.message);
});
window.addEventListener("unhandledrejection", (event) => {
	window.__violations.push("rejection: " + String(event.reason));
});
</script>
<script type="module">
import * as ui from ${JSON.stringify(ENTRY)};
window.__ui = ui;
</script>
</head>
<body></body>
</html>`;

/**
 * Waits for the sandbox to load the elements, then proves the policy is
 * enforced and its violations observed, before clearing the probe's one.
 */
async function openSandbox(
	canvasElement: HTMLElement,
): Promise<{ win: Sandbox; ui: Elements; violations: string[] }> {
	const frame = canvasElement.querySelector("iframe");
	if (frame === null) throw new Error("sandbox iframe did not render");
	const { win, ui, violations } = await waitFor(
		() => {
			const win = frame.contentWindow as Sandbox | null;
			if (win?.__ui === undefined || win.__violations === undefined)
				throw new Error("sandbox has not loaded the elements");
			return { win, ui: win.__ui, violations: win.__violations };
		},
		{ timeout: 15000 },
	);
	const probe = win.document.createElement("div");
	expect(() => {
		probe.innerHTML = "<b>probe</b>";
	}).toThrow();
	await waitFor(() => expect(violations).toHaveLength(1));
	expect(violations[0]).toMatch(/^require-trusted-types-for/);
	violations.length = 0;
	ui.defineElements();
	return { win, ui, violations };
}

// An explicit empty args type: inferring one for a meta without a component trips TS2590.
const meta = preview.type<{ args: Record<string, never> }>().meta({
	title: "Trusted Types",
	// Test-only: hidden from the sidebar and given no docs page.
	tags: ["!dev", "!autodocs"],
	render: () => html`
		<iframe
			title="Trusted Types sandbox"
			srcdoc=${SANDBOX_DOCUMENT}
			style="display: block; width: 100%; height: 100vh; border: 0"
		></iframe>
	`,
});

export const Modal = meta.story({
	play: async ({ canvasElement }) => {
		const { win, violations } = await openSandbox(canvasElement);
		const modal = win.document.createElement("bchc-modal");
		modal.view = viewFor();
		win.document.body.append(modal);
		await waitFor(
			() => expect(modal.shadowRoot?.querySelector(".code svg")).toBeTruthy(),
			{ timeout: 10000 },
		);
		// The connect screen, in either the split or the sheet layout.
		expect(modal.shadowRoot?.querySelector(".split, .single")).toBeTruthy();
		expect(violations).toEqual([]);
	},
});

// A redraw takes a different path from the first draw, keeping the outgoing drawing to cross-fade from.
export const ModalRedraw = meta.story({
	play: async ({ canvasElement }) => {
		const { win, violations } = await openSandbox(canvasElement);
		const modal = win.document.createElement("bchc-modal");
		modal.view = viewFor();
		win.document.body.append(modal);
		const first = await waitFor(
			() => {
				const drawing = modal.shadowRoot?.querySelector(".code svg");
				if (drawing == null) throw new Error("code not drawn");
				return drawing;
			},
			{ timeout: 10000 },
		);
		modal.view = viewFor({ protocol: "cashconnect" });
		await waitFor(
			() => {
				// First, so a blocked redraw times out reporting its violation.
				expect(violations).toEqual([]);
				const code = modal.shadowRoot?.querySelector(".code");
				expect(code?.querySelector(".code-outgoing")).toBeTruthy();
				const current = code?.querySelector("svg:not(.code-outgoing)");
				expect(current).toBeTruthy();
				expect(current).not.toBe(first);
			},
			{ timeout: 10000 },
		);
		expect(violations).toEqual([]);
	},
});

export const Toast = meta.story({
	play: async ({ canvasElement }) => {
		const { win, violations } = await openSandbox(canvasElement);
		const toast = win.document.createElement("bchc-toast");
		toast.duration = Number.POSITIVE_INFINITY;
		toast.view = {
			walletName: CONNECTED_WALLET.name,
			walletLogo: CONNECTED_WALLET.logo,
		};
		win.document.body.append(toast);
		await waitFor(() =>
			expect(
				toast.shadowRoot?.querySelector(".done-title")?.textContent,
			).toContain(CONNECTED_WALLET.name),
		);
		expect(violations).toEqual([]);
	},
});
