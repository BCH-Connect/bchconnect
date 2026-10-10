// A separate element from the modal: outlives it, must not block anything,
// and a dapp with its own notifications can simply not mount it.

import { ElementBase } from "./element.ts";
import { escapeHtml } from "./html.ts";
import { icon } from "./icons.ts";
import { animationsFinished } from "./motion.ts";
import theme from "./styles/theme.generated.css" with { type: "css" };
import toast from "./styles/toast.css" with { type: "css" };
import tokens from "./styles/tokens.css" with { type: "css" };

/**
 * What the toast shows: who answered.
 *
 * @beta
 */
export interface ToastView {
	/**
	 * The wallet that connected, shown alongside its logo. `null` when the
	 * wallet didn't identify itself; the toast then says "Wallet connected".
	 */
	readonly walletName: string | null;
	/** The wallet's logo, so the moment shows who answered. */
	readonly walletLogo: string | null;
}

/**
 * What the toast asks the caller to do. It never does this itself.
 *
 * @beta
 */
export interface BchcToastEvents {
	/** Fired once the exit has played. Remove the element on it. */
	"bchc-dismiss": CustomEvent<void>;
}

const DEFAULT_DURATION = 3600;

function titleFor(view: ToastView): string {
	return view.walletName === null
		? "Wallet connected"
		: `Connected to ${view.walletName}`;
}

/**
 * The `<bchc-toast>` custom element, confirming a successful connection. It is
 * separate from the modal so it can outlive it; it never blocks the page, and a
 * dapp with its own notifications can leave it out.
 *
 * @tag bchc-toast
 *
 * @attr {BchcAccent} data-bchc-accent - Curated accent color.
 * @attr {BchcNeutral} data-bchc-neutral - Neutral family override; each accent has a default pairing.
 * @attr {BchcRadius} data-bchc-radius - Corner radius preset applied to every rounded part.
 * @attr {BchcFont} data-bchc-font - Font stack; `brand` falls back to `system` until a face is injected.
 * @attr {BchcMode} data-bchc-mode - Color scheme; `auto` follows `prefers-color-scheme`.
 *
 * @fires {CustomEvent<void>} bchc-dismiss - Fired once the exit has played. Remove the element on it.
 *
 * @cssprop --bchc-font-brand-family - Brand font family read when `data-bchc-font="brand"`; falls back to the system stack until set.
 *
 * @example
 * ```ts
 * defineElements();
 * const toast = document.createElement("bchc-toast") as BchcToast;
 * toast.view = { walletName: "Cashonize", walletLogo: "/cashonize.png" };
 * toast.addEventListener("bchc-dismiss", () => toast.remove());
 * document.body.append(toast);
 * ```
 *
 * @beta
 */
export class BchcToast extends ElementBase {
	readonly #root: ShadowRoot;
	#view: ToastView | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#exiting = false;
	#duration = DEFAULT_DURATION;

	// Ticked down on pause, restarted with this value on resume.
	#remainingMs = DEFAULT_DURATION;
	#timerStartedAt = 0;
	#pauseCount = 0;

	constructor() {
		super();
		this.#root = this.attachShadow({ mode: "open" });
		this.#root.adoptedStyleSheets = [theme, tokens, toast];
	}

	/**
	 * The connection to announce. Setting it re-renders the toast: the first
	 * time builds it and plays its entrance; afterwards it updates the name
	 * and logo in place, without replaying the entrance.
	 */
	get view(): ToastView | null {
		return this.#view;
	}

	set view(next: ToastView | null) {
		this.#view = next;
		this.#render();
	}

	/**
	 * How long the toast stays before it dismisses itself, in milliseconds.
	 * Hovering or focusing it pauses the countdown. `Infinity` keeps it until
	 * {@link BchcToast.dismiss} is called or the visitor dismisses it. Setting
	 * it while the toast is shown restarts the countdown.
	 *
	 * @defaultValue `3600`
	 */
	get duration(): number {
		return this.#duration;
	}

	set duration(next: number) {
		this.#duration = next;
		if (!this.#shown() || this.#exiting) return;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		this.#remainingMs = next;
		if (this.#pauseCount === 0) this.#startTimer(next);
	}

	/** Called by the browser when the element is attached. @internal */
	connectedCallback(): void {
		this.#render();
		this.#arm();
	}

	/** Called by the browser when the element is detached. @internal */
	disconnectedCallback(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		this.#exiting = false;
		this.#pauseCount = 0;
		// A re-attached toast is a new appearance: it builds and enters again.
		this.#root.replaceChildren();
	}

	/** Play the exit, then tell the caller. A second call does nothing. */
	async dismiss(): Promise<void> {
		const toastElement = this.#root.querySelector(".toast");
		if (!(toastElement instanceof HTMLElement) || this.#exiting) return;
		this.#exiting = true;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		toastElement.classList.add("is-exiting");
		await animationsFinished(toastElement);
		this.dispatchEvent(
			new CustomEvent("bchc-dismiss", { bubbles: true, composed: true }),
		);
	}

	// The toast is on screen: built and attached.
	#shown(): boolean {
		return this.isConnected && this.#root.querySelector(".toast") !== null;
	}

	// Starts the countdown once per appearance, whichever of attaching or setting `view` comes last.
	#arm(): void {
		if (!this.#shown() || this.#timer !== null || this.#exiting) return;
		if (this.#pauseCount > 0) return;
		this.#remainingMs = this.#duration;
		this.#startTimer(this.#duration);
	}

	#startTimer(duration: number): void {
		// setTimeout fires at once for delays of 2^31 ms or more, Infinity included.
		if (!(duration < 2 ** 31)) return;
		this.#timerStartedAt = Date.now();
		this.#timer = setTimeout(() => void this.dismiss(), duration);
	}

	// First of hover/focus to arrive pauses the timer.
	readonly #onPauseStart = (): void => {
		this.#pauseCount += 1;
		if (this.#pauseCount > 1 || this.#timer === null) return;
		clearTimeout(this.#timer);
		this.#timer = null;
		this.#remainingMs -= Date.now() - this.#timerStartedAt;
	};

	// Resumes only once neither hover nor focus still holds it paused.
	readonly #onPauseEnd = (): void => {
		this.#pauseCount = Math.max(0, this.#pauseCount - 1);
		if (this.#pauseCount > 0 || this.#exiting) return;
		this.#startTimer(Math.max(this.#remainingMs, 0));
	};

	#render(): void {
		const view = this.#view;
		if (view === null) {
			if (this.#timer !== null) clearTimeout(this.#timer);
			this.#timer = null;
			// The removed element never reports its pointer or focus leaving.
			this.#pauseCount = 0;
			this.#root.replaceChildren();
			return;
		}

		const existing = this.#root.querySelector(".toast");
		if (existing instanceof HTMLElement) {
			this.#update(existing, view);
			return;
		}

		const logo = view.walletLogo;
		const element = document.createElement("div");
		element.className = "toast";
		// Siblings, not nested: a live region inside the button wouldn't announce.
		element.innerHTML = `
			<span class="toast-live" role="status">
				<span class="done-mark${logo === null ? " is-bare" : ""}">
					${logo === null ? "" : `<img src="${escapeHtml(logo)}" alt="" width="44" height="44" />`}
					<span class="check">${icon("check")}</span>
				</span>
				<span class="done-title">${escapeHtml(titleFor(view))}</span>
			</span>
			<button class="toast-dismiss" type="button" aria-label="Dismiss"></button>
		`;
		element.addEventListener("click", () => void this.dismiss());
		element.addEventListener("pointerenter", this.#onPauseStart);
		element.addEventListener("pointerleave", this.#onPauseEnd);
		element.addEventListener("focusin", this.#onPauseStart);
		element.addEventListener("focusout", this.#onPauseEnd);
		this.#root.replaceChildren(element);
		this.#arm();
	}

	/** Updates an already-built toast's name and logo without replaying its entrance. */
	#update(element: HTMLElement, view: ToastView): void {
		const mark = element.querySelector(".done-mark");
		if (mark instanceof HTMLElement) {
			mark.classList.toggle("is-bare", view.walletLogo === null);
			const img = mark.querySelector("img");
			if (view.walletLogo === null) {
				img?.remove();
			} else if (img instanceof HTMLImageElement) {
				img.src = view.walletLogo;
			} else {
				const created = document.createElement("img");
				created.src = view.walletLogo;
				created.alt = "";
				created.width = 44;
				created.height = 44;
				mark.prepend(created);
			}
		}
		const title = element.querySelector(".done-title");
		if (title instanceof HTMLElement) {
			title.textContent = titleFor(view);
		}
	}
}
