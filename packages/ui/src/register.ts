// modal.ts draws through a renderer supplied here, never importing
// qr-code-styling itself, so its specifier never reaches modal.ts.

import type { CodeRenderer } from "./code.ts";
import { BchcModal, useCodeRenderer } from "./modal.ts";
import { BchcToast } from "./toast.ts";

/** Wires `renderer` in and defines both elements; no-op on a server, idempotent. @internal */
export function register(renderer: CodeRenderer): void {
	if (typeof customElements === "undefined") return;
	useCodeRenderer(renderer);
	if (customElements.get("bchc-modal") === undefined) {
		customElements.define("bchc-modal", BchcModal);
	}
	if (customElements.get("bchc-toast") === undefined) {
		customElements.define("bchc-toast", BchcToast);
	}
}
