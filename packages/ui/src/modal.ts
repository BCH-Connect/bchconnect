// Renders a ModalView and emits intents; holds no connection logic.
// Close is requested here but performed by the caller on `bchc-close`.

import {
	type CSSResultGroup,
	html,
	LitElement,
	nothing,
	type PropertyDeclarations,
	type PropertyValues,
	svg,
	type TemplateResult,
} from "lit";
import { classMap } from "lit/directives/class-map.js";
import { keyed } from "lit/directives/keyed.js";
import { createRef, ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { type CodeRenderer, renderCode } from "./code.ts";
import { safeHref } from "./html.ts";
import { icon } from "./icons.ts";
import { type BchcMessages, mergeMessages } from "./messages.ts";
import {
	animationsFinished,
	crossfade,
	enter,
	flipRows,
	morphHeight,
	namedAnimationsFinished,
	type RowSnapshot,
	retext,
	slideSheet,
	snapshotRows,
	tempoOf,
} from "./motion.ts";
import { type DraggableSheet, draggableSheet } from "./sheet.ts";
import {
	type FailureReason,
	type ModalScreen,
	type ModalView,
	NETWORK_LABEL,
	type ProtocolId,
} from "./state.ts";
import modal from "./styles/modal.css" with { type: "css" };
import theme from "./styles/theme.generated.css" with { type: "css" };
import tokens from "./styles/tokens.css" with { type: "css" };

/**
 * Events representing what the modal asks the caller to do.
 *
 * @beta
 */
export interface BchcModalEvents {
	/** Fired when the visitor picks a different session type. */
	"bchc-protocol": CustomEvent<{ protocol: ProtocolId }>;
	/** Fired when the visitor moves between the connect and wallets screens. */
	"bchc-screen": CustomEvent<{ screen: ModalScreen }>;
	/** Fired once the exit has played. Remove the element on it. */
	"bchc-close": CustomEvent<void>;
	/** Fired when "Try again" is pressed after a failure. */
	"bchc-retry": CustomEvent<void>;
}

/** Below this the modal is a drawer: the dialog needs its 760px card plus 16px overlay padding each side. */
const SHEET_QUERY = "(max-width: 791px)";
/** How long to wait after a deep link before assuming nothing opened (a failed handler gives no signal). */
const DEEP_LINK_GRACE = 1500;
const PLACEHOLDER_LINK =
	"bchconnect://placeholder/kqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcyla";
const COPIED_FOR = 1800;
/** `@keyframes` names. See `#close`. */
const EXIT_ANIMATIONS = new Set(["lift", "sink", "sheet-out", "scrim-out"]);
const NO_BROKEN_LOGOS: ReadonlySet<string> = new Set();

// Shared by every modal, so overlapping ones can't restore each other's lock: the first lock
// saves the page's own inline values and the last unlock restores them.
let pageScrollLocks = 0;
let savedOverflow = "";
let savedScrollbarGutter = "";

function lockPageScroll(): void {
	pageScrollLocks += 1;
	if (pageScrollLocks > 1) return;
	const root = document.documentElement;
	savedOverflow = root.style.overflow;
	savedScrollbarGutter = root.style.scrollbarGutter;
	// Measured before hiding overflow, which would itself remove the scrollbar.
	const hasScrollbar = innerWidth - root.clientWidth > 0;
	root.style.overflow = "hidden";
	if (hasScrollbar) root.style.scrollbarGutter = "stable";
}

function unlockPageScroll(): void {
	pageScrollLocks -= 1;
	if (pageScrollLocks > 0) return;
	const root = document.documentElement;
	root.style.overflow = savedOverflow;
	root.style.scrollbarGutter = savedScrollbarGutter;
}

type CaptionKind = "initiating" | "hint" | "scan" | "none";

// The catalogue's copy keys: `lang` is a tag, and the function keys need a value.
type MessageTextKey = Exclude<
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

// How the next body rebuild moves: measured in `willUpdate`, played around the commit in `update`.
type BodyMotion =
	| { readonly kind: "crossfade"; readonly sheet: boolean }
	| {
			readonly kind: "flip";
			readonly sheet: boolean;
			readonly rows: Map<string, RowSnapshot>;
	  };

const TITLE_KEYS: Readonly<Record<ModalScreen, MessageTextKey>> = {
	connect: "connectTitle",
	wallets: "getWalletTitle",
};

function captionKind(view: ModalView, linkFailed: boolean): CaptionKind {
	switch (view.phase.kind) {
		case "initiating":
			return "initiating";
		case "awaiting-approval":
			return linkFailed ? "hint" : "scan";
		default:
			return "none";
	}
}

function copyFace(messages: BchcMessages, copied: boolean): TemplateResult {
	return copied
		? html`${icon("check")}${messages.linkCopied}`
		: html`${icon("link")}${messages.copyLink}`;
}

function caption(messages: BchcMessages, kind: CaptionKind): unknown {
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

function statusFace(
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

// Injected by register.ts instead of importing code.ts directly, so
// qr-code-styling stays out of modal.ts's own module graph.
let codeRenderer: CodeRenderer | null = null;

/** Sets the renderer, once, before any modal is created. @internal */
export function useCodeRenderer(renderer: CodeRenderer): void {
	codeRenderer = renderer;
}

/**
 * The `<bchc-modal>` web component
 *
 * @tag bchc-modal
 *
 * @attr {BchcAccent} data-bchc-accent - Curated accent color.
 * @attr {BchcNeutral} data-bchc-neutral - Neutral family override; each accent has a default pairing.
 * @attr {BchcRadius} data-bchc-radius - Corner radius preset applied to every rounded part.
 * @attr {BchcFont} data-bchc-font - Font stack; `brand` falls back to `system` until a face is injected.
 * @attr {BchcBlur} data-bchc-blur - Backdrop blur behind the modal.
 * @attr {BchcMode} data-bchc-mode - Color scheme; `auto` follows `prefers-color-scheme`.
 *
 * @fires {CustomEvent<{ protocol: ProtocolId }>} bchc-protocol - Fired when the visitor picks a different session type.
 * @fires {CustomEvent<{ screen: ModalScreen }>} bchc-screen - Fired when the visitor moves between the connect and wallets screens.
 * @fires {CustomEvent<void>} bchc-close - Fired once the exit has played. Remove the element on it.
 * @fires {CustomEvent<void>} bchc-retry - Fired when "Try again" is pressed after a failure.
 *
 * @cssprop --bchc-font-brand-family - Brand font family read when `data-bchc-font="brand"`; falls back to the system stack until set.
 *
 * @example
 * ```ts
 * defineElements();
 * const modal = document.createElement("bchc-modal") as BchcModal;
 * modal.view = view;
 * modal.addEventListener("bchc-protocol", (event) => { ... });
 * modal.addEventListener("bchc-close", () => modal.remove());
 * document.body.append(modal);
 * ```
 *
 * @beta
 */
export class BchcModal extends LitElement {
	/** Lit's reactive property declarations. @internal */
	static override properties: PropertyDeclarations = {
		view: { attribute: false },
		messages: { attribute: false },
		_appearance: { state: true },
		_bodyView: { state: true },
		_bodyKey: { state: true },
		_sheet: { state: true },
		_rtl: { state: true },
		_title: { state: true },
		_caption: { state: true },
		_status: { state: true },
		_copied: { state: true },
		_linkFailed: { state: true },
		_brokenLogos: { state: true },
	};

	/** Lit's adopted style sheets. @internal */
	static override styles: CSSResultGroup = [theme, tokens, modal];

	/** The state to render. Setting it re-renders the modal. */
	declare view: ModalView | null;

	/**
	 * Overrides for the strings this element shows and announces.
	 *
	 * @defaultValue `null`
	 */
	declare messages: Partial<BchcMessages> | null;

	// One per shown shell: a new key makes Lit build a fresh shell, which enters again.
	declare private _appearance: number | null;
	// The view the body shows; held back once connected, so the body stays still while the modal exits.
	declare private _bodyView: ModalView | null;
	// A new key rebuilds the body; any other change patches it in place.
	declare private _bodyKey: string | null;
	declare private _sheet: boolean;
	// `:dir()` doesn't reliably see directionality inherited from outside the
	// shadow tree; the `direction` property itself does, so CSS reads it from `.is-rtl`.
	declare private _rtl: boolean;
	// What the title, caption and status show; `retext` moves them to the view's values after a fade.
	declare private _title: string;
	declare private _caption: CaptionKind;
	declare private _status: FailureReason | null;
	declare private _copied: boolean;
	declare private _linkFailed: boolean;
	// Logo URLs that failed to load this appearance; they render the generic tile instead.
	declare private _brokenLogos: ReadonlySet<string>;

	#copyResetTimer: ReturnType<typeof setTimeout> | null = null;
	#deepLinkTimer: ReturnType<typeof setTimeout> | null = null;
	#closing = false;
	#entered = false;
	#appearances = 0;
	#motion: BodyMotion | null = null;
	// Set only while this shell holds the page scroll lock, so unlocking twice is a no-op.
	#scrollLocked = false;
	readonly #overlay = createRef<HTMLDialogElement>();
	readonly #card = createRef<HTMLDivElement>();
	readonly #scrim = createRef<HTMLDivElement>();
	readonly #body = createRef<HTMLDivElement>();
	#drag: DraggableSheet | null = null;
	readonly #media: MediaQueryList = matchMedia(SHEET_QUERY);
	// Outlives every re-render, so the renderer updates the existing drawing instead of restarting it.
	readonly #codeHost: HTMLButtonElement = document.createElement("button");

	get #messages(): BchcMessages {
		return mergeMessages(this.messages);
	}

	constructor() {
		super();
		// Assigned here, not as class fields, which would shadow the reactive accessors.
		this.view = null;
		this.messages = null;
		this._appearance = null;
		this._bodyView = null;
		this._bodyKey = null;
		this._sheet = false;
		this._rtl = false;
		this._title = "";
		this._caption = "none";
		this._status = null;
		this._copied = false;
		this._linkFailed = false;
		this._brokenLogos = NO_BROKEN_LOGOS;
		this.#codeHost.className = "code";
		this.#codeHost.type = "button";
		this.#codeHost.setAttribute("data-act", "copy");
	}

	/** Called by the browser when the element is attached. @internal */
	override connectedCallback(): void {
		super.connectedCallback();
		this.#media.addEventListener("change", this.#onMediaChange);
		document.addEventListener("visibilitychange", this.#onLeft);
		document.addEventListener("keydown", this.#onKey);
		addEventListener("blur", this.#onLeft);
		// Lit updates by itself only on the first attach; a re-attached modal must render again.
		this.requestUpdate();
	}

	/** Called by the browser when the element is detached. @internal */
	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.#media.removeEventListener("change", this.#onMediaChange);
		document.removeEventListener("visibilitychange", this.#onLeft);
		document.removeEventListener("keydown", this.#onKey);
		removeEventListener("blur", this.#onLeft);
		if (this.#copyResetTimer !== null) {
			clearTimeout(this.#copyResetTimer);
			this.#copyResetTimer = null;
		}
		if (this.#deepLinkTimer !== null) {
			clearTimeout(this.#deepLinkTimer);
			this.#deepLinkTimer = null;
		}
		this._copied = false;
		// A re-attached modal is a new appearance: it enters again.
		this.#hide();
		this.#closing = false;
		this.#entered = false;
		this.requestUpdate();
	}

	/**
	 * Plays the exit, then emits `bchc-close`. A second call while the first
	 * is still playing does nothing.
	 */
	async close(): Promise<void> {
		// A close right after setting `view` must still find the shell.
		if (this.isConnected) await this.updateComplete;
		await this.#close(false);
	}

	// `dragged`: the sheet already left under its own release animation
	// (`settled` resolves once it ends); no CSS exit animation runs for it.
	async #close(dragged: boolean, settled?: Promise<void>): Promise<void> {
		const overlay = this.#overlay.value;
		if (overlay === undefined || this.#closing) return;
		this.#closing = true;
		// A programmatic close can land mid-drag or mid-settle: freeze it
		// inline first, so the CSS exit starts from exactly where it is.
		if (!dragged) this.#drag?.commit();
		overlay.classList.add("is-closing");
		if (dragged) {
			overlay.classList.add("is-dragged");
			await settled;
		} else {
			// Waits only for the exit keyframes, not e.g. the code's write-in animation.
			await namedAnimationsFinished(overlay, EXIT_ANIMATIONS);
		}
		// `close` is queued as a task; awaiting it keeps `close()` resolving after `bchc-close`.
		// A dialog the browser already closed fires no second one.
		if (!overlay.open) return;
		const closed = new Promise((resolve) =>
			overlay.addEventListener("close", resolve, { once: true }),
		);
		overlay.close();
		await closed;
	}

	// A sheet/split switch changes markup, not just layout, so it must re-render.
	readonly #onMediaChange = (): void => {
		this.requestUpdate();
	};

	// The menu closes first; with no menu open this plays the exit before the
	// dialog closes. Shared by Escape and the dialog's own `cancel`.
	#requestClose(): void {
		if (this.#menuOpen()) {
			this.#closeMenu();
			return;
		}
		void this.close();
	}

	readonly #onKey = (event: KeyboardEvent): void => {
		if (event.key !== "Escape" || event.defaultPrevented) return;
		// Also keeps the dialog's close watcher from firing `cancel` for this same keypress
		event.preventDefault();
		this.#requestClose();
	};

	// Catches a close request with no keydown of its own, e.g. a mobile back gesture
	readonly #onCancel = (event: Event): void => {
		if (event.defaultPrevented || !event.cancelable) return;
		event.preventDefault();
		this.#requestClose();
	};

	readonly #onDialogClose = (event: Event): void => {
		if (event.currentTarget !== this.#overlay.value) return;
		this.#closing = true;
		this.#unlockScroll();
		this.#emit("bchc-close");
	};

	// Focus leaving means the deep link opened something; don't report it failed.
	readonly #onLeft = (): void => {
		if (this.#deepLinkTimer !== null) {
			clearTimeout(this.#deepLinkTimer);
			this.#deepLinkTimer = null;
		}
	};

	#emit<K extends keyof BchcModalEvents>(
		type: K,
		detail?: BchcModalEvents[K]["detail"],
	): void {
		this.dispatchEvent(
			new CustomEvent(type, { detail, bubbles: true, composed: true }),
		);
	}

	#onOverlayClick(event: MouseEvent): void {
		const target = event.target;
		if (target === event.currentTarget) {
			void this.close();
			return;
		}
		if (!(target instanceof Element)) return;
		if (target.closest(".close") !== null) {
			void this.close();
			return;
		}
		const option = target.closest(".option");
		if (option !== null) {
			this.#choose(option);
			return;
		}
		const actionTarget = target.closest("[data-act]");
		const action = actionTarget?.getAttribute("data-act");
		if (action === "menu") {
			if (this.#menuOpen()) this.#closeMenu();
			else this.#openMenu();
			return;
		}
		if (this.#menuOpen()) {
			this.#closeMenu(false);
			return;
		}
		if (action === "retry") this.#emit("bchc-retry");
		if (action === "copy") void this.#copyLink();
		if (action === "back") this.#emit("bchc-screen", { screen: "connect" });
		if (action === "wallets") this.#emit("bchc-screen", { screen: "wallets" });
		if (
			action === "open" &&
			this.view?.phase.kind === "awaiting-approval" &&
			actionTarget instanceof HTMLAnchorElement &&
			actionTarget.hasAttribute("href")
		) {
			this.#armDeepLinkHint();
		}
	}

	// Escape closes the menu here; the modal's own listener handles the rest.
	#onOverlayKeydown(event: KeyboardEvent): void {
		if (!this.#menuOpen()) {
			const target = event.target;
			if (
				(event.key === "ArrowDown" || event.key === "ArrowUp") &&
				target instanceof Element &&
				target.closest(".select") !== null
			) {
				event.preventDefault();
				this.#openMenu();
			}
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			this.#stepMenu(event.key === "ArrowDown" ? 1 : -1);
		} else if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			this.#focusMenuEdge(event.key === "Home" ? "first" : "last");
		} else if (event.key === "Enter" || event.key === " ") {
			const target = event.target;
			if (target instanceof Element && target.closest(".option") !== null) {
				event.preventDefault();
				this.#choose(target.closest(".option") as Element);
			}
		} else if (event.key === "Tab") {
			this.#closeMenu(false);
		}
	}

	// Drops the shell; the next update removes it from the shadow root.
	#hide(): void {
		// Closing before the shell goes lets the browser return focus to the opener.
		this.#overlay.value?.close();
		this.#unlockScroll();
		this.#drag?.release();
		this.#drag = null;
		this.#motion = null;
		this._appearance = null;
		this._bodyView = null;
		this._bodyKey = null;
		this._brokenLogos = NO_BROKEN_LOGOS;
	}

	#lockScroll(): void {
		if (this.#scrollLocked) return;
		this.#scrollLocked = true;
		lockPageScroll();
	}

	#unlockScroll(): void {
		if (!this.#scrollLocked) return;
		this.#scrollLocked = false;
		unlockPageScroll();
	}

	/** Lit hook run before each render; derives the shell and body state from `view`. @internal */
	protected override willUpdate(changed: PropertyValues<this>): void {
		// Before the early returns: `messages` set while closed or detached must still reach the code host.
		this.#codeHost.setAttribute("aria-label", this.#messages.copyLinkLabel);
		const view = this.view;
		if (view === null) {
			this.#hide();
			return;
		}
		// A shadow tree built while detached answers computed styles with the page's defaults in WebKit, even right after attaching. Attaching renders again instead.
		if (!this.isConnected) return;
		if (this._appearance === null) {
			// First paint already connected: no shell, `updated` closes directly.
			if (view.phase.kind === "connected") return;
			this.#appearances += 1;
			this._appearance = this.#appearances;
			this._title = this.#messages[TITLE_KEYS[view.screen]];
		} else if (changed.has("messages")) {
			// New wording for the screen still on display; `updated` then animates any screen change as usual.
			const shown = changed.get("view") ?? view;
			this._title = this.#messages[TITLE_KEYS[shown.screen]];
		}
		const previousSheet = this._sheet;
		// Bound rather than toggled after render, so the first style pass already sees them.
		this._sheet = this.#media.matches;
		this._rtl = getComputedStyle(this).direction === "rtl";
		// Success isn't a screen: the body keeps its last face while the modal exits.
		if (view.phase.kind !== "connected") this.#prepareBody(view, previousSheet);
	}

	// Runs while the old body is still in the DOM, so motion can measure it before the commit.
	#prepareBody(view: ModalView, previousSheet: boolean): void {
		const previous = this._bodyView;
		const previousKey = this._bodyKey;
		const sheet = this._sheet;
		const single = view.protocols.length === 1;
		const key = `${view.screen}:${sheet}:${view.protocol}:${single}`;
		this._bodyView = view;
		if (key === previousKey) return;
		this._bodyKey = key;
		this._linkFailed = false;
		this._caption = captionKind(view, false);
		this._status = view.phase.kind === "failed" ? view.phase.reason : null;
		this.#motion = null;

		// The first body of a shell, or one rebuilt for a sheet/split switch, appears without motion.
		if (previous === null || previousKey === null || previousSheet !== sheet)
			return;

		const protocolSwitch =
			previous.screen === "connect" &&
			view.screen === "connect" &&
			previous.protocol !== view.protocol;
		if (!protocolSwitch) {
			this.#motion = { kind: "crossfade", sheet };
			return;
		}
		// Scoped to the column, not just the list, so the link travels with the rows.
		const column = this.#body.value?.querySelector(".left");
		this.#motion = {
			kind: "flip",
			sheet,
			rows:
				column instanceof HTMLElement
					? snapshotRows(column, "[data-id]")
					: new Map<string, RowSnapshot>(),
		};
	}

	/** Lit hook committing the template; a body rebuild is committed inside its motion. @internal */
	protected override update(changed: PropertyValues<this>): void {
		const motion = this.#motion;
		this.#motion = null;
		const card = this.#card.value;
		const body = this.#body.value;
		if (motion === null || card === undefined || body === undefined) {
			super.update(changed);
			return;
		}
		const resize = motion.sheet ? slideSheet : morphHeight;
		// A protocol change FLIPs the wallet rows while the code rewrites;
		// every other change crossfades one screen for another.
		if (motion.kind === "flip") {
			resize(card, () => {
				super.update(changed);
				const next = body.querySelector(".left");
				if (next instanceof HTMLElement)
					flipRows(next, "[data-id]", motion.rows);
			});
			return;
		}
		// Direction 0: the card's width never changes, so nothing should slide sideways.
		resize(card, () => crossfade(body, () => super.update(changed), 0));
	}

	/** Lit hook producing the template. @internal */
	protected override render(): unknown {
		const view = this.view;
		if (this._appearance === null || view === null) return nothing;
		const messages = this.#messages;
		return keyed(
			this._appearance,
			html`<dialog
				class="overlay ${classMap({ "is-sheet": this._sheet, "is-rtl": this._rtl })}"
				lang=${messages.lang}
				aria-labelledby="modal-title"
				${ref(this.#overlay)}
				@click=${this.#onOverlayClick}
				@keydown=${this.#onOverlayKeydown}
				@cancel=${this.#onCancel}
				@close=${this.#onDialogClose}
			>
				<div class="scrim" aria-hidden="true" ${ref(this.#scrim)}></div>
				<div class="card" tabindex="-1" autofocus ${ref(this.#card)}>
					<div class="grabber" aria-hidden="true"></div>
					<div class="head">
						<button class="back" type="button" data-act="back" aria-label=${messages.back} .hidden=${view.screen !== "wallets"}>${icon("chevronLeft")}</button>
						<h2 class="title" id="modal-title">${this._title}</h2>
						<span class="badge" .hidden=${view.network === "mainnet" || view.screen === "wallets"}>${NETWORK_LABEL[view.network]}</span>
						<button class="close" type="button" aria-label=${messages.close}>${icon("x")}</button>
					</div>
					<div class="body" ${ref(this.#body)}>${this.#bodyTemplate()}</div>
				</div>
			</dialog>`,
		);
	}

	// `classMap` only touches the classes it names, so the overlay's `is-closing`/`is-entering` can be toggled directly.
	/** Lit hook run after each render. @internal */
	protected override updated(): void {
		const view = this.view;
		if (view === null || !this.isConnected) return;
		const overlay = this.#overlay.value;
		const card = this.#card.value;
		const scrim = this.#scrim.value;
		const body = this.#body.value;
		if (
			overlay === undefined ||
			card === undefined ||
			scrim === undefined ||
			body === undefined
		) {
			// No shell means the first paint was already connected (distinct
			// from the success-closes-modal case handled further down).
			if (view.phase.kind === "connected") this.#emit("bchc-close");
			return;
		}

		// The drag is created with each shell, so its absence marks the shell's first paint.
		if (this.#drag === null) {
			overlay.showModal();
			this.#lockScroll();
			this.#drag = draggableSheet(card, scrim, {
				isActive: () => this.#media.matches,
				onDismiss: (settled) => void this.#close(true, settled),
			});
		}

		const sheet = this._sheet;

		const title = overlay.querySelector(".title");
		const titleText = this.#messages[TITLE_KEYS[view.screen]];
		if (title instanceof HTMLElement && titleText !== this._title) {
			retext(title, titleText, () => {
				this._title = titleText;
				return this.updateComplete;
			});
		}

		// Success isn't a screen: the modal exits and the caller takes over
		// (first-paint case handled above, before a shell exists).
		if (view.phase.kind === "connected") {
			void this.#close(false);
			return;
		}

		if (view.screen === "connect") {
			this.#retextBody(body, view);
			this.#codeHost.disabled = view.phase.kind !== "awaiting-approval";
			this.#paintCode(view);
			if (sheet) this.#measureSheetRest(card, body);
		}

		if (!this.#entered) {
			this.#entered = true;
			// The drawer's contents ride with the sheet instead of staggering in.
			if (!sheet) {
				enter(
					// .tile excluded: its own write-in animation is its entrance.
					overlay.querySelectorAll(
						".head, .left > *, .single > :not(.tile), .right > .footer",
					),
					tempoOf(card),
				);
				// Entering content starts below its place, showing as scroll overflow until clipped.
				overlay.classList.add("is-entering");
				void animationsFinished(overlay).then(() =>
					overlay.classList.remove("is-entering"),
				);
			}
		}
	}

	// A swap from a body that was rebuilt meanwhile is dropped; the new body already shows the view.
	#retextBody(body: HTMLElement, view: ModalView): void {
		const nextCaption = captionKind(view, this._linkFailed);
		const captionElement = body.querySelector(".caption");
		if (
			captionElement instanceof HTMLElement &&
			nextCaption !== this._caption
		) {
			retext(captionElement, nextCaption, () => {
				if (!captionElement.isConnected) return;
				this._caption = nextCaption;
				return this.updateComplete;
			});
		}
		// The failure face stays in place after a retry, so it is only ever swapped for another.
		const reason = view.phase.kind === "failed" ? view.phase.reason : null;
		const status = body.querySelector(".status");
		if (
			status instanceof HTMLElement &&
			reason !== null &&
			reason !== this._status
		) {
			retext(status, reason, () => {
				if (!status.isConnected) return;
				this._status = reason;
				return this.updateComplete;
			});
		}
	}

	#bodyTemplate(): unknown {
		const view = this._bodyView;
		if (view === null) return nothing;
		return keyed(
			this._bodyKey,
			view.screen === "wallets"
				? this.#walletsScreen(view)
				: this.#connectScreen(view, this._sheet),
		);
	}

	// A native <select> opens an unstyleable platform menu, so this pops a styled listbox.
	#sessionType(view: ModalView): TemplateResult {
		const current = view.protocols.find((entry) => entry.id === view.protocol);
		const sessionType = this.#messages.sessionType;
		// A single session type has nothing to choose, so it shows as the same pill, without the chevron or any interactive state.
		if (view.protocols.length === 1) {
			return html`
				<div class="field">
					<span class="label" id="session-type">${sessionType}</span>
					<span class="select" aria-labelledby="session-type">${current?.name ?? ""}</span>
				</div>
			`;
		}
		// `aria-expanded` and the menu's `hidden` are static: the menu methods own them.
		return html`
			<div class="field">
				<span class="label" id="session-type">${sessionType}</span>
				<div class="select-wrap">
					<button class="select" type="button" data-act="menu" aria-haspopup="listbox" aria-expanded="false" aria-controls="session-menu" aria-labelledby="session-type select-value">
						<span id="select-value">${current?.name ?? ""}</span>
						${icon("chevronDown", 12)}
					</button>
					<ul class="menu" id="session-menu" role="listbox" aria-labelledby="session-type" hidden>
						${view.protocols.map(
							(entry) => html`
							<li class="option" role="option" tabindex="-1" data-protocol=${entry.id} aria-selected=${String(entry.id === view.protocol)}>
								${entry.mark === null ? html`<span class="option-mark"></span>` : html`<img class="option-mark" src=${entry.mark.src} alt="" width="18" height="18" />`}
								<span class="option-name">${entry.name}</span>
								<span class="option-check">${icon("check", 14)}</span>
							</li>`,
						)}
					</ul>
				</div>
			</div>
		`;
	}

	#menu(): HTMLElement | null {
		const menu = this.#overlay.value?.querySelector(".menu");
		return menu instanceof HTMLElement ? menu : null;
	}

	#menuOpen(): boolean {
		const menu = this.#menu();
		return menu !== null && !menu.hidden;
	}

	#openMenu(): void {
		const menu = this.#menu();
		const trigger = this.#overlay.value?.querySelector(".select");
		if (menu === null || !(trigger instanceof HTMLElement) || !menu.hidden)
			return;
		menu.hidden = false;
		trigger.setAttribute("aria-expanded", "true");
		const tempo = tempoOf(menu);
		menu.animate(
			[
				{ opacity: 0, transform: "translateY(-6px) scale(0.94)" },
				{ opacity: 1, transform: "none" },
			],
			{ duration: tempo.base * 0.8, easing: tempo.enter },
		);
		const chosen = menu.querySelector('[aria-selected="true"]');
		if (chosen instanceof HTMLElement) chosen.focus({ preventScroll: true });
	}

	#closeMenu(refocus = true): void {
		const menu = this.#menu();
		const trigger = this.#overlay.value?.querySelector(".select");
		if (menu === null || menu.hidden) return;
		if (trigger instanceof HTMLElement) {
			trigger.setAttribute("aria-expanded", "false");
			if (refocus) trigger.focus({ preventScroll: true });
		}
		const tempo = tempoOf(menu);
		const exiting = menu.animate(
			[
				{ opacity: 1, transform: "none" },
				{ opacity: 0, transform: "translateY(-4px) scale(0.97)" },
			],
			{ duration: tempo.fast, easing: tempo.out, fill: "forwards" },
		);
		exiting.finished
			.catch(() => undefined)
			.finally(() => {
				menu.hidden = true;
				// Forward fill pins opacity; cancel or it stays hidden next open.
				exiting.cancel();
			});
	}

	#stepMenu(step: 1 | -1): void {
		const menu = this.#menu();
		if (menu === null) return;
		const options = [...menu.querySelectorAll<HTMLElement>(".option")];
		if (options.length === 0) return;
		const active = this.shadowRoot?.activeElement;
		const at = active instanceof HTMLElement ? options.indexOf(active) : -1;
		const next =
			at === -1
				? options.findIndex(
						(option) => option.getAttribute("aria-selected") === "true",
					)
				: (at + step + options.length) % options.length;
		options[Math.max(next, 0)]?.focus({ preventScroll: true });
	}

	#focusMenuEdge(edge: "first" | "last"): void {
		const menu = this.#menu();
		if (menu === null) return;
		const options = menu.querySelectorAll<HTMLElement>(".option");
		const target = edge === "first" ? options[0] : options[options.length - 1];
		target?.focus({ preventScroll: true });
	}

	#choose(option: Element): void {
		const protocol = option.getAttribute("data-protocol");
		this.#closeMenu();
		if (protocol === null || protocol === this.view?.protocol) return;
		this.#emit("bchc-protocol", { protocol: protocol as ProtocolId });
	}

	#walletPrompt(): TemplateResult {
		// data-id lets it FLIP with the rows instead of jumping to its new place.
		return html`<p class="get-one" data-id="get-one"><button type="button" data-act="wallets">${this.#messages.noWallet}</button></p>`;
	}

	// `null`, empty, whitespace-only or failed renders the generic wallet tile in place of an `<img>`.
	#logo(logo: string | null, size: number, extraClass: string): TemplateResult {
		const trimmed = logo?.trim();
		if (
			trimmed === undefined ||
			trimmed === "" ||
			this._brokenLogos.has(trimmed)
		) {
			const className =
				extraClass === "" ? "logo-fallback" : `logo-fallback ${extraClass}`;
			return html`<span class=${className} aria-hidden="true">${icon("wallet")}</span>`;
		}
		return html`<img class=${extraClass === "" ? nothing : extraClass} src=${trimmed} alt="" width=${size} height=${size} @error=${this.#onLogoError} />`;
	}

	// Bound with `@error`: inline `onerror` is blocked by CSP.
	#onLogoError(event: Event): void {
		const img = event.currentTarget;
		const src =
			img instanceof HTMLImageElement ? img.getAttribute("src") : null;
		if (src === null || this._brokenLogos.has(src)) return;
		this._brokenLogos = new Set([...this._brokenLogos, src]);
	}

	// The component-owned code host goes where the slot was, so the drawing survives rebuilds.
	#code(view: ModalView): TemplateResult {
		const failed = view.phase.kind === "failed";
		const messages = this.#messages;
		return html`
			<div class="tile ${classMap({ "is-initiating": view.phase.kind === "initiating", "is-failed": failed })}">
				<span class="probe" aria-hidden="true"></span>
				<span class="skeleton" aria-hidden="true"></span>
				${codeRenderer === null ? html`<div class="code"></div>` : this.#codeHost}
				<div class="status" role="status">${statusFace(messages, this._status)}</div>
			</div>
			<div class="footer ${classMap({ "is-void": failed })}">
				<p class="caption">${caption(messages, this._caption)}</p>
				<button class="button pill ${classMap({ "is-copied": this._copied })}" type="button" data-act="copy" .disabled=${view.phase.kind !== "awaiting-approval"}>${copyFace(messages, this._copied)}</button>
			</div>
		`;
	}

	#connectScreen(view: ModalView, sheet: boolean): TemplateResult {
		const failed = view.phase.kind === "failed";
		const messages = this.#messages;
		// No href keeps the anchor inert and unfocusable, instead of navigating to `#`.
		const link =
			view.phase.kind === "awaiting-approval"
				? safeHref(view.phase.link)
				: null;

		if (sheet) {
			return html`
				<div class="single">
					${this.#sessionType(view)}
					${this.#code(view)}
					<div class="primary-slot ${classMap({ "is-failed": failed })}">
						<a class="button primary block" data-act="open" href=${link ?? nothing} aria-disabled=${link === null ? "true" : nothing}>${messages.openInWallet}</a>
						<button class="button primary block retry" type="button" data-act="retry">${icon("rotateCcw", 15)}${messages.tryAgain}</button>
					</div>
					${this.#walletPrompt()}
				</div>
			`;
		}

		// `repeat` keeps each row's node with its wallet, so a loaded or failed logo stays with it.
		return html`
			<div class="split">
				<div class="left">
					${this.#sessionType(view)}
					<p class="section-label">${messages.walletsHeading}</p>
					<div class="wallets">
						${repeat(
							view.wallets,
							(wallet) => wallet.id,
							(wallet) => {
								const href =
									wallet.href === null ? null : safeHref(wallet.href);
								return html`
							<a class="wallet" data-id=${wallet.id} href=${href ?? nothing} aria-disabled=${href === null ? "true" : nothing}>
								${this.#logo(wallet.logo, 32, "")}
								<span class="wallet-name" title=${wallet.name}>${wallet.name}</span>
								${href === null ? nothing : html`<span class="go">${icon("arrowUpRight", 14)}</span>`}
							</a>`;
							},
						)}
					</div>
					${this.#walletPrompt()}
				</div>
				<div class="right">
					${this.#code(view)}
				</div>
			</div>
		`;
	}

	#walletsScreen(view: ModalView): TemplateResult {
		const messages = this.#messages;
		return html`
			<div class="single">
				<p class="section-label">${messages.directoryHeading}</p>
				<div class="directory">
					${view.directory.map((entry) => {
						const href = entry.link === null ? null : safeHref(entry.link.href);
						const logo = this.#logo(entry.logo, 36, "directory-logo");
						const name = html`<span class="wallet-name" title=${entry.name}>${entry.name}</span>`;
						if (href === null)
							return html`
						<div class="directory-row">
							${logo}
							${name}
						</div>`;
						return html`
						<a class="directory-row" href=${href} target="_blank" rel="noreferrer">
							${logo}
							${name}
							<span class="directory-links">
								<span class="button pill">${entry.link?.label ?? messages.getWallet(entry.name)}${icon("arrowUpRight", 14)}</span>
							</span>
						</a>`;
					})}
				</div>
			</div>
		`;
	}

	// The code and the button share this handler via data-act="copy".
	async #copyLink(): Promise<void> {
		const view = this.view;
		if (view === null || view.phase.kind !== "awaiting-approval") return;
		try {
			await navigator.clipboard.writeText(view.phase.link);
		} catch {
			// No error state: the code is still on screen and scannable.
			return;
		}
		this.#setCopied(true);
		if (this.#copyResetTimer !== null) clearTimeout(this.#copyResetTimer);
		this.#copyResetTimer = setTimeout(() => this.#setCopied(false), COPIED_FOR);
	}

	#setCopied(copied: boolean): void {
		this._copied = copied;
	}

	// Only watches whether the deep link opened something; never blocks the navigation.
	#armDeepLinkHint(): void {
		if (this._linkFailed) return;
		if (this.#deepLinkTimer !== null) clearTimeout(this.#deepLinkTimer);
		this.#deepLinkTimer = setTimeout(() => {
			this.#deepLinkTimer = null;
			if (document.visibilityState !== "visible") return;
			// `updated` fades the caption over to the hint.
			this._linkFailed = true;
		}, DEEP_LINK_GRACE);
	}

	// Everything in the sheet but the tile, which sizes itself from what is left of the viewport.
	#measureSheetRest(card: HTMLElement, body: HTMLElement): void {
		const tile = body.querySelector(".tile");
		if (!(tile instanceof HTMLElement)) return;
		// Rounded up: a fraction short would leave the body scrollable by that fraction.
		const rest = Math.ceil(
			card.offsetHeight -
				body.clientHeight +
				(body.scrollHeight - tile.offsetHeight),
		);
		card.style.setProperty("--bchc-sheet-rest", `${rest}px`);
	}

	#paintCode(view: ModalView): void {
		const renderer = codeRenderer;
		if (renderer === null) return;

		const initiating = view.phase.kind === "initiating";
		if (view.phase.kind !== "awaiting-approval" && !initiating) return;

		// Colours come from the probe, not the tile, whose colours transition on failure/retry.
		const probe = this.#codeHost.parentElement?.querySelector(".probe");
		if (!(probe instanceof HTMLElement)) return;
		const tileStyles = getComputedStyle(probe);

		const protocol = view.protocols.find((entry) => entry.id === view.protocol);
		void renderCode(renderer, this.#codeHost, {
			link:
				view.phase.kind === "awaiting-approval"
					? view.phase.link
					: PLACEHOLDER_LINK,
			// Placeholder carries the real mark too, so nothing shifts when the link arrives.
			mark: protocol?.mark ?? null,
			foreground: tileStyles.color,
			background: tileStyles.backgroundColor,
			accent: tileStyles.accentColor,
			placeholder: initiating,
		});
	}
}
