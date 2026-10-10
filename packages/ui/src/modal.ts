// Renders a ModalView and emits intents; holds no connection logic.
// Close is requested here but performed by the caller on `bchc-close`.

import { type CodeRenderer, renderCode } from "./code.ts";
import { ElementBase } from "./element.ts";
import { escapeHtml, safeHref } from "./html.ts";
import { icon } from "./icons.ts";
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
	FAILURE_COPY,
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
const LOADING_DOTS = '<span class="dots"><i></i><i></i><i></i></span>';

function copyFace(copied: boolean): string {
	return copied ? `${icon("check")}Link copied` : `${icon("link")}Copy link`;
}

// `null`, empty, or whitespace-only renders the generic wallet tile in place
// of an `<img>`; a load failure swaps to the same tile via `wireLogoFallbacks`.
function logoMarkup(
	logo: string | null,
	size: number,
	extraClass: string,
): string {
	const trimmed = logo?.trim();
	if (trimmed === undefined || trimmed === "") {
		const className =
			extraClass === "" ? "logo-fallback" : `logo-fallback ${extraClass}`;
		return `<span class="${className}" aria-hidden="true">${icon("wallet")}</span>`;
	}
	const classAttr = extraClass === "" ? "" : ` class="${extraClass}"`;
	return `<img${classAttr} src="${escapeHtml(trimmed)}" alt="" width="${size}" height="${size}" />`;
}

// Inline `onerror` is blocked by CSP, so a failed logo is caught here instead,
// once per `<img>` the markup above just inserted.
function wireLogoFallbacks(container: ParentNode): void {
	for (const img of container.querySelectorAll(
		"img.directory-logo, .wallet > img",
	)) {
		img.addEventListener(
			"error",
			() => {
				const className =
					img.className === ""
						? "logo-fallback"
						: `logo-fallback ${img.className}`;
				const span = document.createElement("span");
				span.className = className;
				span.setAttribute("aria-hidden", "true");
				span.innerHTML = icon("wallet");
				img.replaceWith(span);
			},
			{ once: true },
		);
	}
}

function captionFor(view: ModalView, linkFailed: boolean): string {
	switch (view.phase.kind) {
		case "initiating":
			return `${LOADING_DOTS}<span class="caption-text">Getting your connection link</span>`;
		case "awaiting-approval":
			return linkFailed
				? `${icon("info")}<span class="caption-text">Didn't open? Copy the link.</span>`
				: `${icon("scanLine")}<span class="caption-text">Scan with your wallet</span>`;
		default:
			return "";
	}
}

const RING_DOTS = 14;

/** Each dot carries its index (`--i`) so the stylesheet can animate them in order. */
function ring(): string {
	const dots = Array.from({ length: RING_DOTS }, (_, index) => {
		const angle = (index / RING_DOTS) * Math.PI * 2 - Math.PI / 2;
		const x = (48 + Math.cos(angle) * 41).toFixed(2);
		const y = (48 + Math.sin(angle) * 41).toFixed(2);
		return `<circle cx="${x}" cy="${y}" r="3.6" style="--i:${index}"/>`;
	}).join("");
	return `<svg class="ring" width="96" height="96" viewBox="0 0 96 96" fill="currentColor" aria-hidden="true">${dots}</svg>`;
}

function statusFace(view: ModalView): string {
	if (view.phase.kind !== "failed") return "";
	const copy = FAILURE_COPY[view.phase.reason];
	return `
		<span class="status-mark">${ring()}${icon("x", 34)}</span>
		<strong class="status-title">${escapeHtml(copy.title)}</strong>
		<p class="status-detail">${escapeHtml(copy.detail)}</p>
		<button class="button primary pill retry" type="button" data-act="retry">${icon("rotateCcw", 15)}Try again</button>
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
export class BchcModal extends ElementBase {
	readonly #root: ShadowRoot;
	#view: ModalView | null = null;
	#shown: ModalView | null = null;
	#copyResetTimer: ReturnType<typeof setTimeout> | null = null;
	#deepLinkTimer: ReturnType<typeof setTimeout> | null = null;
	#copied = false;
	#linkFailed = false;
	#closing = false;
	#entered = false;
	#overlay: HTMLDivElement | null = null;
	#drag: DraggableSheet | null = null;
	// Re-templating moves the code element between parents; skipped unless the body shape changed.
	#bodyKey: string | null = null;
	readonly #media: MediaQueryList = matchMedia(SHEET_QUERY);
	// Outlives every re-render, so the renderer updates the existing drawing instead of restarting it.
	readonly #codeHost: HTMLButtonElement = document.createElement("button");

	constructor() {
		super();
		this.#root = this.attachShadow({ mode: "open" });
		this.#root.adoptedStyleSheets = [theme, tokens, modal];
		this.#codeHost.className = "code";
		this.#codeHost.type = "button";
		this.#codeHost.setAttribute("data-act", "copy");
		this.#codeHost.setAttribute("aria-label", "Copy connection link");
	}

	/** The state to render. Setting it re-renders the modal. */
	get view(): ModalView | null {
		return this.#view;
	}

	set view(next: ModalView | null) {
		this.#view = next;
		this.#render();
	}

	/** Called by the browser when the element is attached.
	 *
	 * @internal
	 */
	connectedCallback(): void {
		this.#media.addEventListener("change", this.#onMediaChange);
		document.addEventListener("visibilitychange", this.#onLeft);
		document.addEventListener("keydown", this.#onKey);
		addEventListener("blur", this.#onLeft);
		this.#render();
	}

	/** Called by the browser when the element is detached.
	 *
	 * @internal
	 */
	disconnectedCallback(): void {
		this.#media.removeEventListener("change", this.#onMediaChange);
		document.removeEventListener("visibilitychange", this.#onLeft);
		document.removeEventListener("keydown", this.#onKey);
		removeEventListener("blur", this.#onLeft);
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
		this.#copied = false;
		// A re-attached modal is a new appearance: it enters again.
		this.#root.replaceChildren();
		this.#overlay = null;
		this.#bodyKey = null;
		this.#shown = null;
		this.#closing = false;
		this.#entered = false;
	}

	/**
	 * Plays the exit, then emits `bchc-close`. A second call while the first
	 * is still playing does nothing.
	 */
	async close(): Promise<void> {
		await this.#close(false);
	}

	// `dragged`: the sheet already left under its own release animation
	// (`settled` resolves once it ends); no CSS exit animation runs for it.
	async #close(dragged: boolean, settled?: Promise<void>): Promise<void> {
		const overlay = this.#overlay;
		if (overlay === null || this.#closing) return;
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
		this.#emit("bchc-close");
	}

	// A sheet/split switch changes markup, not just layout, so it must re-render.
	readonly #onMediaChange = (): void => {
		this.#bodyKey = null;
		this.#render();
	};

	readonly #onKey = (event: KeyboardEvent): void => {
		if (event.key !== "Escape" || event.defaultPrevented) return;
		event.preventDefault();
		if (this.#menuOpen()) {
			this.#closeMenu();
			return;
		}
		void this.close();
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

	// Built once; everything inside `.body` is replaced per render.
	#buildShell(): HTMLDivElement {
		const overlay = document.createElement("div");
		overlay.className = "overlay";
		overlay.innerHTML = `
			<div class="scrim" aria-hidden="true"></div>
			<div class="card" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
				<div class="grabber" aria-hidden="true"></div>
				<div class="head">
					<button class="back" type="button" data-act="back" aria-label="Back" hidden>${icon("chevronLeft")}</button>
					<h2 class="title" id="modal-title">Connect a wallet</h2>
					<span class="badge" hidden></span>
					<button class="close" type="button" aria-label="Close">${icon("x")}</button>
				</div>
				<div class="body"></div>
			</div>
		`;

		overlay.addEventListener("click", (event) => {
			const target = event.target;
			if (target === overlay) {
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
			if (action === "wallets")
				this.#emit("bchc-screen", { screen: "wallets" });
			if (
				action === "open" &&
				this.#view?.phase.kind === "awaiting-approval" &&
				actionTarget instanceof HTMLAnchorElement &&
				actionTarget.hasAttribute("href")
			) {
				this.#armDeepLinkHint();
			}
		});

		// Escape closes the menu here; the modal's own listener handles the rest.
		overlay.addEventListener("keydown", (event) => {
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
		});

		const card = overlay.querySelector(".card");
		const scrim = overlay.querySelector(".scrim");
		if (card instanceof HTMLElement && scrim instanceof HTMLElement) {
			this.#drag = draggableSheet(card, scrim, {
				isActive: () => this.#media.matches,
				onDismiss: (settled) => void this.#close(true, settled),
			});
		}

		this.#root.replaceChildren(overlay);
		return overlay;
	}

	#render(): void {
		const view = this.#view;
		if (view === null) {
			this.#root.replaceChildren();
			this.#overlay = null;
			this.#bodyKey = null;
			this.#shown = null;
			return;
		}

		// A shadow tree built while detached answers computed styles with the page's defaults in WebKit, even right after attaching. connectedCallback renders instead.
		if (!this.isConnected) return;

		const firstPaint = this.#overlay === null;

		// First paint already connected: nothing to animate, so close directly
		// (distinct from the success-closes-modal case handled further down).
		if (firstPaint && view.phase.kind === "connected") {
			this.#emit("bchc-close");
			return;
		}

		const overlay = this.#overlay ?? this.#buildShell();
		this.#overlay = overlay;
		const sheet = this.#media.matches;
		overlay.classList.toggle("is-sheet", sheet);
		// `:dir()` doesn't reliably see directionality inherited from outside the
		// shadow tree; the `direction` property itself does, so CSS reads it from here.
		overlay.classList.toggle(
			"is-rtl",
			getComputedStyle(this).direction === "rtl",
		);

		const card = overlay.querySelector(".card");
		const title = overlay.querySelector(".title");
		const body = overlay.querySelector(".body");
		if (
			!(card instanceof HTMLElement) ||
			!(title instanceof HTMLElement) ||
			!(body instanceof HTMLElement)
		) {
			return;
		}

		const titleText =
			view.screen === "wallets" ? "Get a wallet" : "Connect a wallet";
		if (firstPaint) title.textContent = titleText;
		else retext(title, titleText);

		const back = overlay.querySelector(".back");
		if (back instanceof HTMLElement) back.hidden = view.screen !== "wallets";

		const badge = overlay.querySelector(".badge");
		if (badge instanceof HTMLElement) {
			// Hidden rather than emptied, or it would still reserve space.
			badge.hidden = view.network === "mainnet" || view.screen === "wallets";
			badge.textContent = NETWORK_LABEL[view.network];
		}

		// Success isn't a screen: the modal exits and the caller takes over
		// (first-paint case handled above, before a shell exists).
		if (view.phase.kind === "connected") {
			void this.close();
			return;
		}

		const single = view.protocols.length === 1;
		const key = `${view.screen}:${sheet}:${view.protocol}:${single}`;
		if (key !== this.#bodyKey) {
			this.#rebuild(card, body, view, sheet);
			this.#bodyKey = key;
			this.#linkFailed = false;
		}

		this.#patch(body, view);
		if (view.screen === "connect") this.#paintCode(body, view);
		if (sheet && view.screen === "connect") this.#measureSheetRest(card, body);
		this.#shown = view;

		// Nothing to animate if not yet connected.
		if (!this.#entered && this.isConnected) {
			this.#entered = true;
			card.focus({ preventScroll: true });
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

	// A protocol change FLIPs the wallet rows while the code rewrites;
	// every other change crossfades one screen for another.
	#rebuild(
		card: HTMLElement,
		body: HTMLElement,
		view: ModalView,
		sheet: boolean,
	): void {
		const html =
			view.screen === "wallets"
				? this.#walletsScreen(view)
				: this.#connectScreen(view, sheet);
		const previous = this.#shown;

		if (previous === null || this.#bodyKey === null) {
			body.innerHTML = html;
			wireLogoFallbacks(body);
			return;
		}

		const protocolSwitch =
			previous.screen === "connect" &&
			view.screen === "connect" &&
			previous.protocol !== view.protocol;

		const resize = sheet ? slideSheet : morphHeight;

		if (protocolSwitch) {
			// Scoped to the column, not just the list, so the link travels with the rows.
			const column = body.querySelector(".left");
			const rows: Map<string, RowSnapshot> =
				column instanceof HTMLElement
					? snapshotRows(column, "[data-id]")
					: new Map<string, RowSnapshot>();
			resize(card, () => {
				body.innerHTML = html;
				wireLogoFallbacks(body);
				const next = body.querySelector(".left");
				if (next instanceof HTMLElement) flipRows(next, "[data-id]", rows);
			});
			return;
		}

		// Direction 0: the card's width never changes, so nothing should slide sideways.
		resize(card, () => {
			crossfade(
				body,
				() => {
					body.innerHTML = html;
					wireLogoFallbacks(body);
				},
				0,
			);
		});
	}

	#patch(body: HTMLElement, view: ModalView): void {
		if (view.screen !== "connect") return;
		const live = view.phase.kind === "awaiting-approval";
		const failed = view.phase.kind === "failed";

		const tile = body.querySelector(".tile");
		if (tile instanceof HTMLElement) {
			tile.classList.toggle("is-initiating", view.phase.kind === "initiating");
			tile.classList.toggle("is-failed", failed);
		}

		const status = body.querySelector(".status");
		if (status instanceof HTMLElement && failed) {
			retext(status, statusFace(view));
		}

		const caption = body.querySelector(".caption");
		if (caption instanceof HTMLElement)
			retext(caption, captionFor(view, this.#linkFailed));

		const footer = body.querySelector(".footer");
		// Keeps its box so the column/card height doesn't change.
		if (footer instanceof HTMLElement)
			footer.classList.toggle("is-void", failed);

		const copy = body.querySelector(".button[data-act='copy']");
		if (copy instanceof HTMLButtonElement) copy.disabled = !live;
		this.#codeHost.disabled = !live;

		const open = body.querySelector("a[data-act='open']");
		if (open instanceof HTMLAnchorElement) {
			// No href keeps the anchor inert and unfocusable, instead of navigating to `#`.
			const href = live ? safeHref(view.phase.link) : null;
			if (href === null) {
				open.removeAttribute("href");
				open.setAttribute("aria-disabled", "true");
			} else {
				open.href = href;
				open.removeAttribute("aria-disabled");
			}
		}

		const primarySlot = body.querySelector(".primary-slot");
		if (primarySlot instanceof HTMLElement) {
			primarySlot.classList.toggle("is-failed", failed);
		}
	}

	// A native <select> opens an unstyleable platform menu, so this pops a styled listbox.
	#sessionType(view: ModalView): string {
		const current = view.protocols.find((entry) => entry.id === view.protocol);
		// A single session type has nothing to choose, so it shows as the same pill, without the chevron or any interactive state.
		if (view.protocols.length === 1) {
			return `
				<div class="field">
					<span class="label" id="session-type">Session type</span>
					<span class="select" aria-labelledby="session-type">${escapeHtml(current?.name ?? "")}</span>
				</div>
			`;
		}
		return `
			<div class="field">
				<span class="label" id="session-type">Session type</span>
				<div class="select-wrap">
					<button class="select" type="button" data-act="menu" aria-haspopup="listbox" aria-expanded="false" aria-controls="session-menu" aria-labelledby="session-type select-value">
						<span id="select-value">${escapeHtml(current?.name ?? "")}</span>
						${icon("chevronDown", 12)}
					</button>
					<ul class="menu" id="session-menu" role="listbox" aria-labelledby="session-type" hidden>
						${view.protocols
							.map(
								(entry) => `
							<li class="option" role="option" tabindex="-1" data-protocol="${entry.id}" aria-selected="${entry.id === view.protocol}">
								${entry.mark === null ? '<span class="option-mark"></span>' : `<img class="option-mark" src="${escapeHtml(entry.mark.src)}" alt="" width="18" height="18" />`}
								<span class="option-name">${escapeHtml(entry.name)}</span>
								<span class="option-check">${icon("check", 14)}</span>
							</li>`,
							)
							.join("")}
					</ul>
				</div>
			</div>
		`;
	}

	#menu(): HTMLElement | null {
		const menu = this.#overlay?.querySelector(".menu");
		return menu instanceof HTMLElement ? menu : null;
	}

	#menuOpen(): boolean {
		const menu = this.#menu();
		return menu !== null && !menu.hidden;
	}

	#openMenu(): void {
		const menu = this.#menu();
		const trigger = this.#overlay?.querySelector(".select");
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
		const trigger = this.#overlay?.querySelector(".select");
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
		const active = this.#root.activeElement;
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
		if (protocol === null || protocol === this.#view?.protocol) return;
		this.#emit("bchc-protocol", { protocol: protocol as ProtocolId });
	}

	#walletPrompt(): string {
		// data-id lets it FLIP with the rows instead of jumping to its new place.
		return `<p class="get-one" data-id="get-one"><button type="button" data-act="wallets">Don't have a wallet?</button></p>`;
	}

	// The code host is slotted into `.code` by #paintCode.
	#code(view: ModalView): string {
		const initiating = view.phase.kind === "initiating";
		const failed = view.phase.kind === "failed";
		const faces = `${initiating ? " is-initiating" : ""}${failed ? " is-failed" : ""}`;
		return `
			<div class="tile${faces}">
				<span class="probe" aria-hidden="true"></span>
				<span class="skeleton" aria-hidden="true"></span>
				<div class="code"></div>
				<div class="status" role="status">${statusFace(view)}</div>
			</div>
			<div class="footer${failed ? " is-void" : ""}">
				<p class="caption">${captionFor(view, this.#linkFailed)}</p>
				<button class="button pill" type="button" data-act="copy"${initiating ? " disabled" : ""}>${copyFace(this.#copied)}</button>
			</div>
		`;
	}

	#connectScreen(view: ModalView, sheet: boolean): string {
		const failed = view.phase.kind === "failed";
		const link =
			view.phase.kind === "awaiting-approval"
				? safeHref(view.phase.link)
				: null;
		const wallets = view.wallets.map((wallet) => ({
			...wallet,
			href: wallet.href === null ? null : safeHref(wallet.href),
		}));

		if (sheet) {
			return `
				<div class="single">
					${this.#sessionType(view)}
					${this.#code(view)}
					<div class="primary-slot${failed ? " is-failed" : ""}">
						<a class="button primary block" data-act="open"${link === null ? ' aria-disabled="true"' : ` href="${escapeHtml(link)}"`}>Open in your wallet</a>
						<button class="button primary block retry" type="button" data-act="retry">${icon("rotateCcw", 15)}Try again</button>
					</div>
					${this.#walletPrompt()}
				</div>
			`;
		}

		return `
			<div class="split">
				<div class="left">
					${this.#sessionType(view)}
					<p class="section-label">Open in your wallet</p>
					<div class="wallets">
						${wallets
							.map(
								(wallet) => `
							<a class="wallet" data-id="${escapeHtml(wallet.id)}"${wallet.href === null ? ' aria-disabled="true"' : ` href="${escapeHtml(wallet.href)}"`}>
								${logoMarkup(wallet.logo, 32, "")}
								<span class="wallet-name" title="${escapeHtml(wallet.name)}">${escapeHtml(wallet.name)}</span>
								${wallet.href === null ? "" : `<span class="go">${icon("arrowUpRight", 14)}</span>`}
							</a>`,
							)
							.join("")}
					</div>
					${this.#walletPrompt()}
				</div>
				<div class="right">
					${this.#code(view)}
				</div>
			</div>
		`;
	}

	#walletsScreen(view: ModalView): string {
		return `
			<div class="single">
				<p class="section-label">Bitcoin Cash wallets that work here</p>
				<div class="directory">
					${view.directory
						.map((entry) => ({
							...entry,
							href: entry.link === null ? null : safeHref(entry.link.href),
						}))
						.map(
							(entry) => `
						${entry.href === null ? '<div class="directory-row">' : `<a class="directory-row" href="${escapeHtml(entry.href)}" target="_blank" rel="noreferrer">`}
							${logoMarkup(entry.logo, 36, "directory-logo")}
							<span class="wallet-name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</span>
							${
								entry.href === null
									? ""
									: `<span class="directory-links">
								<span class="button pill">${escapeHtml(entry.link?.label ?? "Get it")}${icon("arrowUpRight", 14)}</span>
							</span>`
							}
						${entry.href === null ? "</div>" : "</a>"}`,
						)
						.join("")}
				</div>
			</div>
		`;
	}

	// The code and the button share this handler via data-act="copy".
	async #copyLink(): Promise<void> {
		const view = this.#view;
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
		this.#copied = copied;
		const button = this.#overlay?.querySelector('.button[data-act="copy"]');
		if (!(button instanceof HTMLElement)) return;
		button.classList.toggle("is-copied", copied);
		button.innerHTML = copyFace(copied);
	}

	// Only watches whether the deep link opened something; never blocks the navigation.
	#armDeepLinkHint(): void {
		if (this.#linkFailed) return;
		if (this.#deepLinkTimer !== null) clearTimeout(this.#deepLinkTimer);
		this.#deepLinkTimer = setTimeout(() => {
			this.#deepLinkTimer = null;
			if (document.visibilityState !== "visible") return;
			this.#linkFailed = true;
			const caption = this.#overlay?.querySelector(".caption");
			const view = this.#view;
			if (caption instanceof HTMLElement && view !== null)
				retext(caption, captionFor(view, true));
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

	#paintCode(body: HTMLElement, view: ModalView): void {
		const renderer = codeRenderer;
		if (renderer === null) return;

		// The host replaces the fresh slot after a rebuild, so the drawing survives.
		const slot = body.querySelector(".code");
		if (slot instanceof HTMLElement && slot !== this.#codeHost) {
			slot.replaceWith(this.#codeHost);
		}
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
