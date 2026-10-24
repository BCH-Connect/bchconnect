// Renders a ModalView and emits intents; holds no connection logic.
// Close is requested here but performed by the caller on `bchc-close`.

import {
	type CSSResultGroup,
	html,
	LitElement,
	nothing,
	type PropertyDeclarations,
	type PropertyValues,
	type TemplateResult,
} from "lit";
import { classMap } from "lit/directives/class-map.js";
import { keyed } from "lit/directives/keyed.js";
import { live } from "lit/directives/live.js";
import { createRef, ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { type CodeRenderer, renderCode } from "./code.ts";
import { directoryScreen } from "./directory.ts";
import {
	type CaptionKind,
	type CaptionWallet,
	caption,
	captionKind,
	copyFace,
	type MessageTextKey,
	statusFace,
} from "./faces.ts";
import { safeHref } from "./html.ts";
import { icon } from "./icons.ts";
import { type BchcMessages, mergeMessages } from "./messages.ts";
import {
	animationsFinished,
	crossfade,
	enter,
	morphHeight,
	namedAnimationsFinished,
	retext,
	slideSheet,
	tempoOf,
} from "./motion.ts";
import { lockPageScroll, unlockPageScroll } from "./page-scroll.ts";
import { type DraggableSheet, draggableSheet } from "./sheet.ts";
import { SHEET_QUERY } from "./sheet-query.ts";
import {
	type FailureReason,
	type ModalScreen,
	type ModalView,
	NETWORK_LABEL,
	type ProtocolId,
	type ProtocolOption,
	type WalletOption,
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
	/**
	 * Fired when the visitor selects a wallet, and before `bchc-protocol` when a
	 * tab change pins the default wallet. When the selected wallet lacks the
	 * current session type, `bchc-protocol` follows with the first one it speaks.
	 */
	"bchc-wallet": CustomEvent<{ wallet: string }>;
	/** Fired when the visitor picks a different session type. */
	"bchc-protocol": CustomEvent<{ protocol: ProtocolId }>;
	/** Fired when the visitor moves between the connect and wallets screens. */
	"bchc-screen": CustomEvent<{ screen: ModalScreen }>;
	/** Fired once the exit has played. Remove the element on it. */
	"bchc-close": CustomEvent<void>;
	/** Fired when "Try again" is pressed after a failure. */
	"bchc-retry": CustomEvent<void>;
}

/** How long to wait after a deep link before assuming nothing opened (a failed handler gives no signal). */
const DEEP_LINK_GRACE = 1500;
const PLACEHOLDER_LINK =
	"bchconnect://placeholder/kqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcyla";
const COPIED_FOR = 1800;
/** `@keyframes` names. See `#close`. */
const EXIT_ANIMATIONS = new Set(["lift", "sink", "sheet-out", "scrim-out"]);
const NO_BROKEN_LOGOS: ReadonlySet<string> = new Set();

// Shorter shaft and a heavier, rounder stroke than the icon set's arrow, to sit with bold text.
const OPEN_ARROW = html`<svg class="open-arrow" width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 8.5 3.5"/><path d="M4.75 3.5H8.5v3.75"/></svg>`;

const TITLE_KEYS: Readonly<Record<ModalScreen, MessageTextKey>> = {
	connect: "connectTitle",
	wallets: "getWalletTitle",
};

/** The view's wallet, or the default: the first listed that speaks the protocol. */
function selectedWallet(view: ModalView): WalletOption | undefined {
	return (
		view.wallets.find((entry) => entry.id === view.wallet) ??
		view.wallets.find((entry) => entry.protocols.includes(view.protocol)) ??
		view.wallets[0]
	);
}

// The drawer lists no wallets, so it offers every session type. The current one
// always stays, so the code is never left without the tab that names it.
function offeredProtocols(
	view: ModalView,
	sheet: boolean,
): readonly ProtocolOption[] {
	const wallet = sheet ? undefined : selectedWallet(view);
	if (wallet === undefined) return view.protocols;
	return view.protocols.filter(
		(entry) =>
			entry.id === view.protocol || wallet.protocols.includes(entry.id),
	);
}

// `{link}` takes the live connection link, so the wallet opens with it filled in.
// "" until there is one: the action shows but can't be used.
function desktopLink(wallet: WalletOption, view: ModalView): string | null {
	if (wallet.href === null) return null;
	if (!wallet.href.includes("{link}")) return safeHref(wallet.href);
	if (view.phase.kind !== "awaiting-approval") return "";
	const link = encodeURIComponent(view.phase.link);
	return safeHref(wallet.href.replaceAll("{link}", () => link));
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
 * @fires {CustomEvent<{ wallet: string }>} bchc-wallet - Fired when the visitor selects a wallet, and before `bchc-protocol` when a tab change pins the default wallet; `bchc-protocol` follows when the selected wallet lacks the current session type.
 * @fires {CustomEvent<{ protocol: ProtocolId }>} bchc-protocol - Fired when the visitor picks a different session type.
 * @fires {CustomEvent<{ screen: ModalScreen }>} bchc-screen - Fired when the visitor moves between the connect and wallets screens.
 * @fires {CustomEvent<void>} bchc-close - Fired once the exit has played. Remove the element on it, or set `view` to `null` before showing it again.
 * @fires {CustomEvent<void>} bchc-retry - Fired when "Try again" is pressed after a failure.
 *
 * @cssprop --bchc-font-brand-family - Brand font family read when `data-bchc-font="brand"`; falls back to the system stack until set.
 *
 * @example
 * ```ts
 * defineElements();
 * const modal = document.createElement("bchc-modal") as BchcModal;
 * modal.view = view;
 * modal.addEventListener("bchc-wallet", (event) => { ... });
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
		_captionWallet: { state: true },
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
	// The wallet the scan caption names, by id; `null` names none.
	declare private _captionWallet: string | null;
	declare private _status: FailureReason | null;
	declare private _copied: boolean;
	declare private _linkFailed: boolean;
	// Logo URLs that failed to load this appearance; they render the generic tile instead.
	declare private _brokenLogos: ReadonlySet<string>;

	#copyResetTimer: ReturnType<typeof setTimeout> | null = null;
	#deepLinkTimer: ReturnType<typeof setTimeout> | null = null;
	#closing = false;
	#closed: Promise<void> | null = null;
	#entered = false;
	#appearances = 0;
	// Set in `willUpdate` when the next body rebuild crossfades; played around the commit in `update`.
	#crossfade: { readonly sheet: boolean } | null = null;
	// Counts wallet-only caption swaps; see `#retextBody`.
	#walletSwaps = 0;
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
		this._captionWallet = null;
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
		// A re-attached modal is a new appearance: it enters again.
		this.#hide();
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
	// A close already playing is returned, so every caller waits for the same exit.
	#close(dragged: boolean, settled?: Promise<void>): Promise<void> {
		if (this.#closing) return this.#closed ?? Promise.resolve();
		const overlay = this.#overlay.value;
		if (overlay === undefined) return Promise.resolve();
		this.#closing = true;
		this.#closed = this.#playClose(overlay, dragged, settled);
		return this.#closed;
	}

	async #playClose(
		overlay: HTMLDialogElement,
		dragged: boolean,
		settled?: Promise<void>,
	): Promise<void> {
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

	// Plays the exit before the dialog closes. Shared by Escape and the dialog's own `cancel`.
	readonly #onKey = (event: KeyboardEvent): void => {
		if (event.key !== "Escape" || event.defaultPrevented) return;
		// Also keeps the dialog's close watcher from firing `cancel` for this same keypress
		event.preventDefault();
		void this.close();
	};

	// Catches a close request with no keydown of its own, e.g. a mobile back gesture
	readonly #onCancel = (event: Event): void => {
		if (event.defaultPrevented || !event.cancelable) return;
		event.preventDefault();
		void this.close();
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
		const tab = target.closest(".tab");
		if (tab !== null) {
			this.#selectProtocol(tab);
			return;
		}
		const row = target.closest("[data-wallet]");
		if (row !== null) {
			this.#selectWallet(row);
			return;
		}
		const actionTarget = target.closest("[data-act]");
		const action = actionTarget?.getAttribute("data-act");
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

	// Roving focus for the wallet radiogroup and the tablist. Manual activation for both:
	// arrows only move focus, since a selection can switch protocol and restart the attempt.
	#onOverlayKeydown(event: KeyboardEvent): void {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const radio = target.closest("[data-wallet]");
		const tab = target.closest(".tab");
		const item = radio ?? tab;
		const group = item?.parentElement?.closest(".wallets, .tabs");
		if (item === null || group === null || group === undefined) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (tab !== null) this.#selectProtocol(tab);
			else this.#selectWallet(item);
			return;
		}
		const items = [
			...group.querySelectorAll<HTMLElement>(
				radio !== null ? "[data-wallet]" : ".tab",
			),
		];
		const at = items.indexOf(item as HTMLElement);
		const forward = this._rtl ? "ArrowLeft" : "ArrowRight";
		const back = this._rtl ? "ArrowRight" : "ArrowLeft";
		let next: number;
		if (event.key === forward || (radio !== null && event.key === "ArrowDown"))
			next = (at + 1) % items.length;
		else if (event.key === back || (radio !== null && event.key === "ArrowUp"))
			next = (at - 1 + items.length) % items.length;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = items.length - 1;
		else return;
		event.preventDefault();
		const nextItem = items[next];
		if (nextItem === undefined) return;
		for (const entry of items) entry.tabIndex = entry === nextItem ? 0 : -1;
		nextItem.focus({ preventScroll: true });
	}

	// Drops the shell; the next update removes it from the shadow root.
	#hide(): void {
		// Closing before the shell goes lets the browser return focus to the opener.
		this.#overlay.value?.close();
		this.#unlockScroll();
		this.#drag?.release();
		this.#drag = null;
		if (this.#copyResetTimer !== null) {
			clearTimeout(this.#copyResetTimer);
			this.#copyResetTimer = null;
		}
		if (this.#deepLinkTimer !== null) {
			clearTimeout(this.#deepLinkTimer);
			this.#deepLinkTimer = null;
		}
		this._copied = false;
		this.#closing = false;
		this.#closed = null;
		this.#entered = false;
		this.#crossfade = null;
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
		// Wallets don't follow the protocol, so a protocol switch or a selection
		// patches the body in place while the code rewrites.
		const key = `${view.screen}:${sheet}`;
		this._bodyView = view;
		if (key === previousKey) return;
		this._bodyKey = key;
		this._linkFailed = false;
		this._caption = captionKind(view, false);
		this._captionWallet = this.#captionWalletOf(view);
		this._status = view.phase.kind === "failed" ? view.phase.reason : null;
		this.#crossfade = null;

		// The first body of a shell, or one rebuilt for a sheet/split switch, appears without motion.
		if (previous === null || previousKey === null || previousSheet !== sheet)
			return;
		this.#crossfade = { sheet };
	}

	/** Lit hook committing the template; a body rebuild is committed inside its motion. @internal */
	protected override update(changed: PropertyValues<this>): void {
		const motion = this.#crossfade;
		this.#crossfade = null;
		const card = this.#card.value;
		const body = this.#body.value;
		if (motion === null || card === undefined || body === undefined) {
			super.update(changed);
			return;
		}
		const resize = motion.sheet ? slideSheet : morphHeight;
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
						".head, .split > :not(.cell-tile), .single > :not(.tile)",
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
		const nextWallet = this.#captionWalletOf(view);
		const captionElement = body.querySelector(".caption");
		// Another wallet on the same scan caption: only its mark and name swap.
		const walletElement = body.querySelector(".caption-wallet");
		if (
			walletElement instanceof HTMLElement &&
			nextCaption === "scan" &&
			this._caption === "scan" &&
			nextWallet !== null &&
			nextWallet !== this._captionWallet
		) {
			retext(walletElement, nextWallet, () => {
				if (!walletElement.isConnected) return;
				this._captionWallet = nextWallet;
				return this.updateComplete;
			});
			this.#walletSwaps += 1;
		} else if (
			captionElement instanceof HTMLElement &&
			(nextCaption !== this._caption ||
				(nextCaption === "scan" && nextWallet !== this._captionWallet))
		) {
			// The count keeps a whole-caption swap from matching a key it saw before a wallet-only swap.
			retext(
				captionElement,
				`${nextCaption}|${nextWallet}|${this.#walletSwaps}`,
				() => {
					if (!captionElement.isConnected) return;
					this._caption = nextCaption;
					this._captionWallet = nextWallet;
					return this.updateComplete;
				},
			);
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
				? directoryScreen(view.directory, this.#messages, (logo, size, extra) =>
						this.#logo(logo, size, extra),
					)
				: this.#connectScreen(view, this._sheet),
		);
	}

	// One tab per offered session type; with one, nothing to choose, so an informational label.
	#sessionType(view: ModalView): TemplateResult {
		const protocols = offeredProtocols(view, this._sheet);
		const sessionType = this.#messages.sessionType;
		const mark = (entry: ProtocolOption): unknown =>
			entry.mark === null
				? nothing
				: html`<img class="tab-mark" src=${entry.mark.src} alt="" width="16" height="16" />`;
		const only = protocols.length === 1 ? protocols[0] : undefined;
		if (only !== undefined) {
			return html`
				<div class="session is-info">
					<span class="label" id="session-type">${sessionType}</span>
					<span class="session-value" aria-labelledby="session-type">${mark(only)}<span>${only.name}</span></span>
				</div>
			`;
		}
		// Past two, only the active tab spells its name (see the stylesheet).
		return html`
			<div class="session is-tabs">
				<span class="visually-hidden" id="session-type">${sessionType}</span>
				<div class="tabs ${classMap({ "is-dense": protocols.length > 2 })}" role="tablist" aria-labelledby="session-type" style="--count:${protocols.length}">
					${repeat(
						protocols,
						(entry) => entry.id,
						(entry) => {
							const active = entry.id === view.protocol;
							return html`
						<button class=${classMap({ tab: true, "no-mark": entry.mark === null })} type="button" role="tab" id="tab-${entry.id}" data-protocol=${entry.id} aria-selected=${String(active)} aria-controls="code-tile" .tabIndex=${live(active ? 0 : -1)} title=${entry.name}>
							${mark(entry)}
							<span class="tab-name"><span class="tab-name-inner">${entry.name}</span></span>
						</button>`;
						},
					)}
				</div>
			</div>
		`;
	}

	// The default wallet follows the protocol, so it is pinned first; the selection
	// changes only when the visitor picks a wallet.
	#selectProtocol(tab: Element): void {
		const view = this.view;
		const protocol = tab.getAttribute("data-protocol");
		if (view === null || protocol === null || protocol === view.protocol)
			return;
		const pinned = view.wallets.some((entry) => entry.id === view.wallet);
		const wallet = selectedWallet(view);
		if (!pinned && wallet !== undefined && !this._sheet)
			this.#emit("bchc-wallet", { wallet: wallet.id });
		this.#emit("bchc-protocol", { protocol: protocol as ProtocolId });
	}

	// Order is contract: the wallet first, then the protocol it falls back to.
	#selectWallet(row: Element): void {
		const view = this.view;
		const id = row.getAttribute("data-wallet");
		if (view === null || id === null || id === selectedWallet(view)?.id) return;
		const wallet = view.wallets.find((entry) => entry.id === id);
		if (wallet === undefined) return;
		this.#emit("bchc-wallet", { wallet: id });
		if (wallet.protocols.includes(view.protocol)) return;
		const fallback = view.protocols.find((entry) =>
			wallet.protocols.includes(entry.id),
		);
		if (fallback !== undefined)
			this.#emit("bchc-protocol", { protocol: fallback.id });
	}

	// The drawer lists no wallets, so its caption never names one.
	#captionWalletOf(view: ModalView): string | null {
		return this._sheet ? null : (selectedWallet(view)?.id ?? null);
	}

	#walletPrompt(): TemplateResult {
		return html`<p class="get-one"><button type="button" data-act="wallets">${this.#messages.noWallet}</button></p>`;
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
	#tile(view: ModalView): TemplateResult {
		const tabbed = offeredProtocols(view, this._sheet).length > 1;
		return html`
			<div class="tile ${classMap({ "is-initiating": view.phase.kind === "initiating", "is-failed": view.phase.kind === "failed" })}" id="code-tile" role=${tabbed ? "tabpanel" : nothing} aria-labelledby=${tabbed ? `tab-${view.protocol}` : nothing}>
				<span class="probe" aria-hidden="true"></span>
				<span class="skeleton" aria-hidden="true"></span>
				${codeRenderer === null ? html`<div class="code"></div>` : this.#codeHost}
				<div class="status" role="status">${statusFace(this.#messages, this._status)}</div>
			</div>
		`;
	}

	#footer(view: ModalView): TemplateResult {
		const messages = this.#messages;
		const named = view.wallets.find(
			(entry) => entry.id === this._captionWallet,
		);
		const wallet: CaptionWallet | null =
			named === undefined
				? null
				: {
						name: named.name,
						template: html`<span class="caption-wallet">${this.#logo(named.logo, 16, "caption-mark")}<span class="caption-name">${named.name}</span></span>`,
					};
		return html`
			<div class=${classMap({ footer: true, "is-void": view.phase.kind === "failed" })}>
				<p class="caption">${caption(messages, this._caption, wallet)}</p>
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
					${this.#tile(view)}
					${this.#footer(view)}
					<div class="primary-slot ${classMap({ "is-failed": failed })}">
						<a class="button primary block" data-act="open" href=${link ?? nothing} aria-disabled=${link === null ? "true" : nothing}>${messages.openInWallet}</a>
						<button class="button primary block retry" type="button" data-act="retry">${icon("rotateCcw", 15)}${messages.tryAgain}</button>
					</div>
					${this.#walletPrompt()}
				</div>
			`;
		}

		const selectedId = selectedWallet(view)?.id;
		// `repeat` keeps each row's node with its wallet, so a loaded or failed logo stays with it.
		return html`
			<div class="split">
				<p class="cell-label section-label" id="wallets-heading">${messages.walletsHeading}</p>
				<div class="cell-control">${this.#sessionType(view)}</div>
				<div class="cell-list">
					<div class="wallets" role="radiogroup" aria-labelledby="wallets-heading">
						${repeat(
							view.wallets,
							(wallet) => wallet.id,
							(wallet) => {
								const selected = wallet.id === selectedId;
								// Rendered on every row with a desktop link and shown on the selected one,
								// so it leaves with the tint instead of vanishing. Hidden ones carry no live link.
								const desktop = desktopLink(wallet, view);
								const href = desktop === null ? null : selected ? desktop : "";
								return html`
							<div class="wallet-row ${classMap({ "has-open": href !== null && selected })}">
								<button class="wallet" type="button" role="radio" aria-checked=${String(selected)} data-wallet=${wallet.id} .tabIndex=${live(selected ? 0 : -1)}>
									${this.#logo(wallet.logo, 32, "")}
									<span class="wallet-name" title=${wallet.name}>${wallet.name}</span>
								</button>
								${
									href === null
										? nothing
										: html`<a class="open ${classMap({ "is-shown": selected })}" tabindex=${selected ? nothing : -1} aria-hidden=${selected ? nothing : "true"} href=${href === "" ? nothing : href} role=${href === "" ? "link" : nothing} aria-disabled=${href === "" ? "true" : nothing} target="_blank" rel="noreferrer" aria-label=${messages.openWalletLabel(wallet.name)}><span class="open-text">${messages.open}</span>${OPEN_ARROW}</a>`
								}
							</div>`;
							},
						)}
					</div>
				</div>
				<div class="cell-tile">${this.#tile(view)}</div>
				<div class="cell-prompt">${this.#walletPrompt()}</div>
				${this.#footer(view)}
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
