import {
	type CSSResultGroup,
	html,
	LitElement,
	nothing,
	type PropertyDeclarations,
	type PropertyValues,
} from "lit";
import { keyed } from "lit/directives/keyed.js";
import { icon } from "./icons.ts";
import { BCHC_MESSAGES_EN, type BchcMessages } from "./messages.ts";
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
export class BchcToast extends LitElement {
	/** Lit's reactive property declarations. @internal */
	static override properties: PropertyDeclarations = {
		view: { attribute: false },
		_appearance: { state: true },
	};

	/** Lit's adopted style sheets. @internal */
	static override styles: CSSResultGroup = [theme, tokens, toast];

	/**
	 * The connection to announce. Setting it re-renders the toast: the first
	 * time builds it and plays its entrance; afterwards it updates the name
	 * and logo in place, without replaying the entrance.
	 */
	declare view: ToastView | null;

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

	// Bumped on detach, so the next attach builds a fresh toast that enters again.
	declare private _appearance: number;

	#timer: ReturnType<typeof setTimeout> | null = null;
	#exiting = false;
	#duration = DEFAULT_DURATION;

	get #messages(): BchcMessages {
		return BCHC_MESSAGES_EN;
	}

	// Ticked down on pause, restarted with this value on resume.
	#remainingMs = DEFAULT_DURATION;
	#timerStartedAt = 0;
	#pauseCount = 0;

	constructor() {
		super();
		// Assigned here, not as class fields, which would shadow the reactive accessors.
		this.view = null;
		this._appearance = 0;
	}

	/** Called by the browser when the element is detached. @internal */
	override disconnectedCallback(): void {
		super.disconnectedCallback();
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		this.#exiting = false;
		this.#pauseCount = 0;
		this._appearance += 1;
	}

	/** Play the exit, then tell the caller. A second call does nothing. */
	async dismiss(): Promise<void> {
		// A dismiss right after setting `view` must still find the toast.
		await this.updateComplete;
		const toastElement = this.renderRoot.querySelector(".toast");
		if (!(toastElement instanceof HTMLElement) || this.#exiting) return;
		this.#exiting = true;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		// Safe outside render: the template's class attribute is static, so Lit never rewrites it.
		toastElement.classList.add("is-exiting");
		await animationsFinished(toastElement);
		this.dispatchEvent(
			new CustomEvent("bchc-dismiss", { bubbles: true, composed: true }),
		);
	}

	/** Lit hook producing the template. @internal */
	protected override render(): unknown {
		const view = this.view;
		if (view === null) return nothing;
		const logo = view.walletLogo;
		const messages = this.#messages;
		// Siblings, not nested: a live region inside the button wouldn't announce.
		return keyed(
			this._appearance,
			html`<div
				class="toast"
				@click=${this.#onClick}
				@pointerenter=${this.#onPauseStart}
				@pointerleave=${this.#onPauseEnd}
				@focusin=${this.#onPauseStart}
				@focusout=${this.#onPauseEnd}
			>
				<span class="toast-live" role="status">
					<span class=${logo === null ? "done-mark is-bare" : "done-mark"}>
						${logo === null ? nothing : html`<img src=${logo} alt="" width="44" height="44" />`}
						<span class="check">${icon("check")}</span>
					</span>
					<span class="done-title">${
						view.walletName === null
							? messages.walletConnected
							: messages.connectedTo(view.walletName)
					}</span>
				</span>
				<button class="toast-dismiss" type="button" aria-label=${messages.dismiss}></button>
			</div>`,
		);
	}

	/** Lit hook run after each render. @internal */
	protected override updated(changed: PropertyValues<this>): void {
		if (this.view === null) {
			if (!changed.has("view")) return;
			if (this.#timer !== null) clearTimeout(this.#timer);
			this.#timer = null;
			// The removed element never reports its pointer or focus leaving.
			this.#pauseCount = 0;
			return;
		}
		this.#arm();
	}

	// The toast is on screen: built and attached.
	#shown(): boolean {
		return this.isConnected && this.renderRoot.querySelector(".toast") !== null;
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

	#onClick(): void {
		void this.dismiss();
	}

	// First of hover/focus to arrive pauses the timer.
	#onPauseStart(): void {
		this.#pauseCount += 1;
		if (this.#pauseCount > 1 || this.#timer === null) return;
		clearTimeout(this.#timer);
		this.#timer = null;
		this.#remainingMs -= Date.now() - this.#timerStartedAt;
	}

	// Resumes only once neither hover nor focus still holds it paused.
	#onPauseEnd(): void {
		this.#pauseCount = Math.max(0, this.#pauseCount - 1);
		if (this.#pauseCount > 0 || this.#exiting) return;
		this.#startTimer(Math.max(this.#remainingMs, 0));
	}
}
