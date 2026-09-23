/**
 * The success toast.
 *
 * A connection that succeeded is not a screen: the person came to use the
 * dapp, not to read that they may now use it. So the modal closes on success
 * and this takes its place for a moment — the wallet that answered, and a
 * check that draws itself in the accent — low on the page, out of the way,
 * gone on a tap or on its own.
 *
 * Deliberately a separate element from the modal rather than a face of it.
 * It outlives the modal, it must not block anything, and a dapp with its own
 * notification system can simply not mount it.
 *
 * @example
 * ```ts
 * const toast = document.createElement("bchc-toast") as BchcToast;
 * toast.view = { walletName: "Cashonize", walletLogo: "/cashonize.png" };
 * toast.addEventListener("bchc:dismiss", () => toast.remove());
 * document.body.append(toast);
 * ```
 */

import { icon } from "./icons.ts";
import { settled } from "./motion.ts";
import theme from "./styles/theme.generated.css" with { type: "css" };
import toast from "./styles/toast.css" with { type: "css" };
import tokens from "./styles/tokens.css" with { type: "css" };

export interface ToastView {
	readonly walletName: string;
	/** The wallet's logo, so the moment shows who answered. */
	readonly walletLogo: string | null;
}

export interface BchcToastEvents {
	/** Fired once the exit has played. Remove the element on it. */
	"bchc:dismiss": CustomEvent<void>;
}

/**
 * How long the toast stays before leaving on its own.
 *
 * Long enough to be read twice, short enough that nobody waits for it: the
 * dapp behind it is already usable.
 */
const SHOWN_FOR = 3600;

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[character] ?? character,
	);
}

export class BchcToast extends HTMLElement {
	readonly #root: ShadowRoot;
	#view: ToastView | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#leaving = false;

	constructor() {
		super();
		this.#root = this.attachShadow({ mode: "open" });
		this.#root.adoptedStyleSheets = [theme, tokens, toast];
	}

	get view(): ToastView | null {
		return this.#view;
	}

	set view(next: ToastView | null) {
		this.#view = next;
		this.render();
	}

	connectedCallback(): void {
		this.render();
		this.#timer = setTimeout(() => void this.dismiss(), SHOWN_FOR);
	}

	disconnectedCallback(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		this.#leaving = false;
	}

	/** Play the exit, then tell the caller. A second call does nothing. */
	async dismiss(): Promise<void> {
		const toastElement = this.#root.querySelector(".toast");
		if (!(toastElement instanceof HTMLElement) || this.#leaving) return;
		this.#leaving = true;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		toastElement.classList.add("is-leaving");
		await settled(toastElement);
		this.dispatchEvent(
			new CustomEvent("bchc:dismiss", { bubbles: true, composed: true }),
		);
	}

	render(): void {
		const view = this.#view;
		if (view === null) {
			this.#root.replaceChildren();
			return;
		}
		// Built once: re-rendering would replay the entrance.
		if (this.#root.querySelector(".toast") !== null) return;

		const logo = view.walletLogo;
		const element = document.createElement("button");
		element.className = "toast";
		element.type = "button";
		element.setAttribute("role", "status");
		element.setAttribute("aria-live", "polite");
		element.innerHTML = `
			<span class="done-mark${logo === null ? " is-bare" : ""}">
				${logo === null ? "" : `<img src="${escapeHtml(logo)}" alt="" width="44" height="44" />`}
				<span class="check">${icon("check")}</span>
			</span>
			<span class="done-title">Connected to ${escapeHtml(view.walletName)}</span>
		`;
		element.addEventListener("click", () => void this.dismiss());
		this.#root.replaceChildren(element);
	}
}

if (!customElements.get("bchc-toast")) {
	customElements.define("bchc-toast", BchcToast);
}
