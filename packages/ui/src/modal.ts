/**
 * The connect modal, as a custom element.
 *
 * Renders a {@link ModalView} and emits intents. It holds no connection logic:
 * every state it can show is a state the caller can hand it, which is what lets
 * the lab drive the failure paths that are near-impossible to reach on demand
 * against a real wallet.
 *
 * The shell — scrim, card, header — is built once and then patched. Rebuilding
 * it on every render replayed the card's entrance animation each time any state
 * changed, so acknowledging a copy made the modal appear to close and reopen.
 *
 * ## What is re-templated and what is patched
 *
 * The body is rebuilt only when its *layout* changes: another screen, a
 * different protocol, a failure or a success replacing the code. Everything
 * else — the wallet engaging, the link arriving, the copy acknowledgement — is
 * patched onto the markup already there, so the code never redraws for a
 * change of caption and the tile never loses its place.
 *
 * Every rebuild is choreographed. Screens slide the way the visitor travels,
 * a change of protocol shuffles the wallet rows to their new places while the
 * code writes itself over the old one, and the card grows or shrinks to fit
 * rather than snapping. `motion.ts` owns the measuring; this file only decides
 * which choreography a change deserves.
 *
 * ## Two layouts, not one layout that narrows
 *
 * On a wide viewport the modal lists wallets, because nothing else on a desktop
 * tells you which wallets work — and a `WIZ://` link usually has no handler
 * registered there at all.
 *
 * On a phone it does not list them. The operating system knows what is
 * installed and we do not, so one deep link asks it. The code stays on screen
 * underneath for the case the deep link cannot serve: a wallet that is
 * installed but never registered the scheme.
 *
 * ## Closing
 *
 * Closing is asked for here — the cross, the scrim, Escape, a drag — but done
 * by the caller: the modal plays its exit and only then emits `bchc:close`, so
 * the caller can remove the element the moment it hears it and nothing is cut
 * short. A caller closing on its own terms, say on success, calls
 * {@link BchcModal.close} and gets the same exit and the same event.
 *
 * Provisional until SPEC section 8. The element name, the events and the view
 * shape are all expected to move once the spec pins them.
 *
 * @example
 * ```ts
 * const modal = document.createElement("bchc-modal") as BchcModal;
 * modal.view = view;
 * modal.addEventListener("bchc:protocol", (event) => { ... });
 * modal.addEventListener("bchc:close", () => modal.remove());
 * document.body.append(modal);
 * ```
 */

import { type CodeRenderer, renderCode } from "./code.ts";
import { icon } from "./icons.ts";
import {
	crossfade,
	enter,
	flipRows,
	morphHeight,
	type RowSnapshot,
	retext,
	settled,
	snapshotRows,
	tempoOf,
} from "./motion.ts";
import { draggableSheet } from "./sheet.ts";
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
 * What the modal asks the caller to do. It never does these itself.
 *
 * There is no separate cancel. Closing while an attempt is in flight *is* the
 * cancel, and the close button, the scrim and the drag all already do it — a
 * further control for the same outcome only makes the user wonder how they
 * differ.
 */
export interface BchcModalEvents {
	"bchc:protocol": CustomEvent<{ protocol: ProtocolId }>;
	"bchc:screen": CustomEvent<{ screen: ModalScreen }>;
	/** Fired once the exit has played. Remove the element on it. */
	"bchc:close": CustomEvent<void>;
	"bchc:retry": CustomEvent<void>;
}

/** Below this the modal is a drawer, above it a dialog. */
const SHEET_QUERY = "(max-width: 639px)";

/**
 * How long to wait after a deep link before assuming nothing happened.
 *
 * A protocol handler that nobody claims fails silently — no prompt, no error.
 * If the page still has focus after this long, nothing opened.
 */
const DEEP_LINK_GRACE = 1500;

/**
 * What is drawn while a relay is still producing the real link. Any fixed
 * string of about the right length gives a code of about the right density;
 * this one is just letters so it never resembles a real address or invite.
 */
const PLACEHOLDER_LINK =
	"bchconnect://placeholder/kqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcylakqzvxwtnmrhpbdgjsfcyla";

/** How long the copy acknowledgement stays before the button settles back. */
const COPIED_FOR = 1800;

const DOTS = '<span class="dots"><i></i><i></i><i></i></span>';

/** The copy control's two faces. Acknowledging in words alone reads as a label
 *  change; swapping the icon with it reads as the action having happened. */
function copyFace(copied: boolean): string {
	return copied ? `${icon("check")}Link copied` : `${icon("link")}Copy link`;
}

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

/** The caption under the code, for the phase the code is in. */
function captionFor(view: ModalView, sheet: boolean): string {
	switch (view.phase.kind) {
		case "initiating":
			return `<span class="caption-text">Getting your connection link</span>${DOTS}`;
		case "awaiting-approval":
			return `${icon("scanLine")}<span class="caption-text">${sheet ? "Or scan from another device" : "Scan with your wallet"}</span>`;
		default:
			return "";
	}
}

/** How many dots make the ring around a failure's mark. */
const RING_DOTS = 14;

/**
 * A ring of dots, in the same language as the code's modules, with a cross
 * inside it. Each dot carries its index so the stylesheet can bring them in
 * one after another, the way the code writes itself in.
 */
function ring(): string {
	const dots = Array.from({ length: RING_DOTS }, (_, index) => {
		const angle = (index / RING_DOTS) * Math.PI * 2 - Math.PI / 2;
		const x = (48 + Math.cos(angle) * 41).toFixed(2);
		const y = (48 + Math.sin(angle) * 41).toFixed(2);
		return `<circle cx="${x}" cy="${y}" r="3.6" style="--i:${index}"/>`;
	}).join("");
	return `<svg class="ring" width="96" height="96" viewBox="0 0 96 96" fill="currentColor" aria-hidden="true">${dots}</svg>`;
}

/**
 * What the code's place becomes when the attempt fails.
 *
 * Not a box: the paper leaves with the code, and the same area holds an open
 * composition — a ring of dots like the code's own, a cross that draws itself
 * inside it, the words, and the way forward. The rest of the modal stays put:
 * someone told to pick another wallet or session type can do it right there.
 */
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

export class BchcModal extends HTMLElement {
	readonly #root: ShadowRoot;
	#view: ModalView | null = null;
	/** What the last render was built from, so the next can tell what moved. */
	#shown: ModalView | null = null;
	#codeRenderer: CodeRenderer | null = null;
	#copyResetTimer: ReturnType<typeof setTimeout> | null = null;
	#deepLinkTimer: ReturnType<typeof setTimeout> | null = null;
	#copied = false;
	#hintShown = false;
	#closing = false;
	/** Whether the contents have made their entrance. Once per appearance. */
	#entered = false;

	/** The persistent shell. Null until the first render builds it. */
	#overlay: HTMLDivElement | null = null;
	#releaseDrag: (() => void) | null = null;

	readonly #media: MediaQueryList = matchMedia(SHEET_QUERY);

	/**
	 * What the body was last built from. Re-templating moves the code element
	 * between parents, which the browser pays for in layout even when the code
	 * itself is untouched, so the markup is rebuilt only when its shape changes.
	 */
	#bodyKey: string | null = null;

	/**
	 * The code lives on an element that outlives every re-render, so the
	 * renderer updates the code it already drew rather than making a new one.
	 */
	readonly #codeHost: HTMLButtonElement = document.createElement("button");

	constructor() {
		super();
		this.#root = this.attachShadow({ mode: "open" });
		this.#root.adoptedStyleSheets = [theme, tokens, modal];
		this.#codeHost.className = "code";
		this.#codeHost.type = "button";
		this.#codeHost.dataset["act"] = "copy";
		this.#codeHost.setAttribute("aria-label", "Copy connection link");
	}

	/**
	 * The code renderer. Injected rather than imported because
	 * `qr-code-styling` ships no ES module entry, so the page has to load its
	 * UMD build and hand the constructor in. Keeping it a parameter means this
	 * file never reaches for a global, and the production path — a bundler
	 * resolving a plain import — is a one-line change here rather than a
	 * rewrite.
	 */
	set codeRenderer(renderer: CodeRenderer) {
		this.#codeRenderer = renderer;
		this.render();
	}

	get view(): ModalView | null {
		return this.#view;
	}

	set view(next: ModalView | null) {
		this.#view = next;
		this.render();
	}

	connectedCallback(): void {
		this.#media.addEventListener("change", this.#onMediaChange);
		document.addEventListener("visibilitychange", this.#onLeft);
		document.addEventListener("keydown", this.#onKey);
		addEventListener("blur", this.#onLeft);
		this.render();
	}

	disconnectedCallback(): void {
		this.#media.removeEventListener("change", this.#onMediaChange);
		document.removeEventListener("visibilitychange", this.#onLeft);
		document.removeEventListener("keydown", this.#onKey);
		removeEventListener("blur", this.#onLeft);
		this.#releaseDrag?.();
		this.#releaseDrag = null;
		if (this.#copyResetTimer !== null) clearTimeout(this.#copyResetTimer);
		if (this.#deepLinkTimer !== null) clearTimeout(this.#deepLinkTimer);
		// A re-attached modal is a new appearance: it enters again.
		this.#root.replaceChildren();
		this.#overlay = null;
		this.#bodyKey = null;
		this.#shown = null;
		this.#closing = false;
		this.#entered = false;
	}

	/**
	 * Play the exit, then tell the caller. Resolves once `bchc:close` has been
	 * dispatched; a second call while the first is still playing does nothing.
	 *
	 * @param how - `dragged` when the drawer was already carried off by hand,
	 * so only the scrim has anything left to animate.
	 */
	async close(how?: "dragged"): Promise<void> {
		const overlay = this.#overlay;
		if (overlay === null || this.#closing) return;
		this.#closing = true;
		overlay.classList.add("is-closing");
		if (how === "dragged") overlay.classList.add("is-dragged");
		await settled(overlay);
		this.#emit("bchc:close");
	}

	/** Crossing the breakpoint changes what the modal contains, not just how it
	 *  is arranged, so it has to re-render rather than rely on CSS. */
	readonly #onMediaChange = (): void => {
		this.#bodyKey = null;
		this.render();
	};

	readonly #onKey = (event: KeyboardEvent): void => {
		if (event.key !== "Escape" || event.defaultPrevented) return;
		event.preventDefault();
		// An open menu is the nearer thing to dismiss.
		if (this.#menuOpen()) {
			this.#closeMenu();
			return;
		}
		void this.close();
	};

	/**
	 * The page losing focus means something else opened — so the deep link
	 * worked and the hint would be a lie.
	 */
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

	/** Built once. Everything inside `.body` is replaced per render. */
	#buildShell(): HTMLDivElement {
		const overlay = document.createElement("div");
		overlay.className = "overlay";
		overlay.innerHTML = `
			<div class="card" role="dialog" aria-modal="true" aria-label="Connect a wallet" tabindex="-1">
				<div class="grabber" aria-hidden="true"></div>
				<div class="head">
					<button class="back" type="button" data-act="back" aria-label="Back" hidden>${icon("chevronLeft")}</button>
					<h2 class="title">Connect a wallet</h2>
					<span class="badge" hidden></span>
					<button class="close" type="button" aria-label="Close">${icon("x")}</button>
				</div>
				<div class="body"></div>
			</div>
		`;

		// Delegated, so re-templating never has to rewire anything.
		overlay.addEventListener("click", (event) => {
			const target = event.target;
			// Clicking the scrim closes; clicking the card does not.
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
			const action = target.closest("[data-act]")?.getAttribute("data-act");
			if (action === "menu") {
				if (this.#menuOpen()) this.#closeMenu();
				else this.#openMenu();
				return;
			}
			// Any other press while the menu is open only closes it.
			if (this.#menuOpen()) {
				this.#closeMenu(false);
				return;
			}
			if (action === "retry") this.#emit("bchc:retry");
			if (action === "copy") void this.#copyLink();
			if (action === "back") this.#emit("bchc:screen", { screen: "connect" });
			if (action === "wallets")
				this.#emit("bchc:screen", { screen: "wallets" });
			if (action === "open") this.#armDeepLinkHint();
		});

		// The listbox's keyboard: arrows move, Enter and Space choose. Escape is
		// handled with the modal's own, so the menu closes before the modal does.
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
		if (card instanceof HTMLElement) {
			this.#releaseDrag = draggableSheet(card, {
				isActive: () => this.#media.matches,
				onDismiss: () => void this.close("dragged"),
			});
		}

		this.#root.replaceChildren(overlay);
		return overlay;
	}

	render(): void {
		const view = this.#view;
		if (view === null) {
			this.#root.replaceChildren();
			this.#overlay = null;
			this.#bodyKey = null;
			this.#shown = null;
			return;
		}

		const firstPaint = this.#overlay === null;
		const overlay = this.#overlay ?? this.#buildShell();
		this.#overlay = overlay;
		const sheet = this.#media.matches;
		overlay.classList.toggle("is-sheet", sheet);

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
			// Off mainnet only. An empty badge still reserves space and still
			// reads as something that failed to load.
			badge.hidden = view.network === "mainnet" || view.screen === "wallets";
			badge.textContent = NETWORK_LABEL[view.network];
		}

		// Success is not a screen: the modal leaves and the caller takes over.
		if (view.phase.kind === "connected") {
			if (this.#overlay === null) this.#emit("bchc:close");
			else void this.close();
			return;
		}

		const key = `${view.screen}:${sheet}:${view.protocol}`;
		if (key !== this.#bodyKey) {
			this.#rebuild(card, body, view, sheet);
			this.#bodyKey = key;
			this.#hintShown = false;
		}

		this.#patch(body, view, sheet);
		if (view.screen === "connect") this.#paintCode(body, view);
		this.#shown = view;

		// Not tied to the shell's first build: a view set before the element is
		// attached builds the shell while disconnected, and an entrance played
		// there is an entrance nobody sees. It plays on the first connected paint.
		if (!this.#entered && this.isConnected) {
			this.#entered = true;
			card.focus({ preventScroll: true });
			enter(
				// The tile is left out: the code writing itself in is its entrance,
				// and a fade laid over that would hide it.
				overlay.querySelectorAll(
					".head, .left > *, .single > :not(.tile), .right > .footer",
				),
				tempoOf(card),
			);
			// The contents start a little below their places, which is overflow
			// as far as the body's scroll container is concerned, and a browser
			// with classic scrollbars shows one for those frames. The body clips
			// until everything has landed.
			overlay.classList.add("is-entering");
			void settled(overlay).then(() => overlay.classList.remove("is-entering"));
		}
	}

	/**
	 * Replace the body's markup with the choreography the change deserves.
	 *
	 * A change of protocol on the connect screen is the one the modal is built
	 * around: the wallet rows shuffle to their new places while the code writes
	 * itself over the old one, and nothing else moves. Every other change is a
	 * screen replacing a screen, which slides the way the visitor is going.
	 */
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
			return;
		}

		const protocolSwitch =
			previous.screen === "connect" &&
			view.screen === "connect" &&
			previous.protocol !== view.protocol;

		if (protocolSwitch) {
			// The whole column, not just the list: the link under it moves too
			// when the list changes length, and has to travel with the rows.
			const column = body.querySelector(".left");
			const rows: Map<string, RowSnapshot> =
				column instanceof HTMLElement
					? snapshotRows(column, "[data-id]")
					: new Map<string, RowSnapshot>();
			morphHeight(card, () => {
				body.innerHTML = html;
				const next = body.querySelector(".left");
				if (next instanceof HTMLElement) flipRows(next, "[data-id]", rows);
			});
			return;
		}

		// Screens rise into place rather than sliding sideways: the card never
		// changes width, so nothing should look as if it did.
		morphHeight(card, () => {
			crossfade(
				body,
				() => {
					body.innerHTML = html;
				},
				0,
			);
		});
	}

	/** Everything that changes without changing the layout. */
	#patch(body: HTMLElement, view: ModalView, sheet: boolean): void {
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
			retext(caption, captionFor(view, sheet));

		const footer = body.querySelector(".footer");
		// Keeps its box while the failure shows, so the column — and with it
		// the card — stays exactly the height it was.
		if (footer instanceof HTMLElement)
			footer.classList.toggle("is-void", failed);

		const copy = body.querySelector(".button[data-act='copy']");
		if (copy instanceof HTMLButtonElement) copy.disabled = !live;
		this.#codeHost.disabled = !live;

		const open = body.querySelector("a[data-act='open']");
		if (open instanceof HTMLAnchorElement) {
			open.href = live ? view.phase.link : "#";
			open.toggleAttribute("aria-disabled", !live);
			open.hidden = failed;
		}

		const hint = body.querySelector(".hint");
		if (hint instanceof HTMLElement) hint.hidden = failed;
	}

	/**
	 * The session type, as a bespoke select.
	 *
	 * A native `<select>` opens the platform's own menu, which no stylesheet
	 * reaches; here the menu is part of the design — the same surface as the
	 * card, the protocols' own marks as row icons, the accent tint for the
	 * row under the pointer and the row that is chosen. The trigger keeps
	 * the ARIA of a select: a button that pops a listbox.
	 */
	#sessionType(view: ModalView): string {
		const current = view.protocols.find((entry) => entry.id === view.protocol);
		return `
			<div class="field">
				<span class="label" id="session-type">Session type</span>
				<div class="select-wrap">
					<button class="select" type="button" data-act="menu" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="session-type select-value">
						<span id="select-value">${escapeHtml(current?.name ?? "")}</span>
						${icon("chevronDown", 12)}
					</button>
					<ul class="menu" role="listbox" aria-labelledby="session-type" hidden>
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

	/** The listbox, if the connect screen is showing one. */
	#menu(): HTMLElement | null {
		const menu = this.#overlay?.querySelector(".menu");
		return menu instanceof HTMLElement ? menu : null;
	}

	#menuOpen(): boolean {
		const menu = this.#menu();
		return menu !== null && !menu.hidden;
	}

	/**
	 * Open the listbox and hand it focus, on the row that is chosen.
	 *
	 * The surface grows out of the pill's corner rather than fading in place:
	 * a menu is something the control produces, not something that appears.
	 */
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
			{ duration: tempo.base * 0.8, easing: tempo.arrive },
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
		const leaving = menu.animate(
			[
				{ opacity: 1, transform: "none" },
				{ opacity: 0, transform: "translateY(-4px) scale(0.97)" },
			],
			{ duration: tempo.fast, easing: tempo.out, fill: "forwards" },
		);
		leaving.finished
			.catch(() => undefined)
			.finally(() => {
				menu.hidden = true;
				// A forward fill outlives the animation; left in place it would
				// keep the menu at opacity 0 the next time it opens.
				leaving.cancel();
			});
	}

	/** Move focus through the options by `step`, wrapping at the ends. */
	#stepMenu(step: 1 | -1): void {
		const menu = this.#menu();
		if (menu === null) return;
		const options = [...menu.querySelectorAll<HTMLElement>(".option")];
		if (options.length === 0) return;
		const active = this.#root.activeElement;
		const at = options.findIndex((option) => option === active);
		const next =
			at === -1
				? options.findIndex(
						(option) => option.getAttribute("aria-selected") === "true",
					)
				: (at + step + options.length) % options.length;
		options[Math.max(next, 0)]?.focus({ preventScroll: true });
	}

	#choose(option: Element): void {
		const protocol = option.getAttribute("data-protocol");
		this.#closeMenu();
		if (protocol === null || protocol === this.#view?.protocol) return;
		this.#emit("bchc:protocol", { protocol: protocol as ProtocolId });
	}

	#walletPrompt(): string {
		// Carries an identity like the rows above it, so it travels with them
		// when the list changes length instead of jumping to its new place.
		return `<p class="get-one" data-id="get-one"><button type="button" data-act="wallets">Don't have a wallet?</button></p>`;
	}

	/**
	 * The tile and its footer. The code host is slotted in by `#paintCode`;
	 * the skeleton is the light that passes over it while there is no link yet,
	 * and the status is the face the tile turns when the attempt fails.
	 */
	#code(view: ModalView, sheet: boolean): string {
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
				<p class="caption">${captionFor(view, sheet)}</p>
				<button class="button pill" type="button" data-act="copy"${initiating ? " disabled" : ""}>${copyFace(this.#copied)}</button>
			</div>
		`;
	}

	#connectScreen(view: ModalView, sheet: boolean): string {
		const failed = view.phase.kind === "failed";
		const link =
			view.phase.kind === "awaiting-approval" ? view.phase.link : "#";

		if (sheet) {
			// No wallet list: the operating system knows what is installed. The
			// code stays for the wallet that is installed but never claimed the
			// scheme, which is the one case the deep link cannot serve.
			return `
				<div class="single">
					${this.#sessionType(view)}
					${this.#code(view, sheet)}
					<a class="button primary block" data-act="open" href="${escapeHtml(link)}"${failed ? " hidden" : ""}>Open in your wallet</a>
					<p class="hint"${failed ? " hidden" : ""}>${icon("info")}<span>Nothing opened? Your wallet may not support links. Scan the code instead.</span></p>
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
						${view.wallets
							.map(
								(wallet) => `
							<a class="wallet" data-id="${escapeHtml(wallet.id)}" href="${escapeHtml(wallet.href ?? "#")}"${wallet.href === null ? ' aria-disabled="true"' : ""}>
								<img src="${escapeHtml(wallet.logo)}" alt="" width="32" height="32" />
								<span class="wallet-name">${escapeHtml(wallet.name)}</span>
								${wallet.href === null ? "" : `<span class="go">${icon("arrowUpRight", 14)}</span>`}
							</a>`,
							)
							.join("")}
					</div>
					${this.#walletPrompt()}
				</div>
				<div class="right">
					${this.#code(view, sheet)}
				</div>
			</div>
		`;
	}

	/**
	 * The directory, in the modal rather than on a website.
	 *
	 * Sending someone away to find a wallet is the moment a connection is
	 * abandoned, and on a phone it is worse than that: with nothing installed,
	 * the deep link does nothing and the native prompt shows nothing, so the
	 * modal is the only thing that can answer.
	 */
	#walletsScreen(view: ModalView): string {
		return `
			<div class="single">
				<p class="section-label">Bitcoin Cash wallets that work here</p>
				<div class="directory">
					${view.directory
						.map(
							(entry) => `
						<a class="directory-row" href="${escapeHtml(entry.links[0]?.href ?? "#")}" target="_blank" rel="noreferrer">
							<img class="directory-logo" src="${escapeHtml(entry.logo)}" alt="" width="36" height="36" />
							<span class="wallet-name">${escapeHtml(entry.name)}</span>
							<span class="directory-links">
								<span class="button pill">${escapeHtml(entry.links[0]?.label ?? "Get it")}${icon("arrowUpRight", 14)}</span>
							</span>
						</a>`,
						)
						.join("")}
				</div>
			</div>
		`;
	}

	/**
	 * Pressing the code and pressing the button are the same action with the
	 * same feedback. Two affordances for one outcome should not produce two
	 * different acknowledgements.
	 */
	async #copyLink(): Promise<void> {
		const view = this.#view;
		if (view === null || view.phase.kind !== "awaiting-approval") return;
		try {
			await navigator.clipboard.writeText(view.phase.link);
		} catch {
			// A refused clipboard is not worth an error state; the code is still
			// on screen and still scannable.
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

	/**
	 * Watch whether the deep link actually went anywhere.
	 *
	 * Nothing here blocks or replaces the navigation — the anchor does its job
	 * regardless. If the page is still in front of the user after the grace
	 * period, the handler did not exist and a line appears explaining why. The
	 * hint is informative, never an error: a wallet that does not claim the
	 * scheme is not the user's mistake.
	 */
	#armDeepLinkHint(): void {
		if (this.#hintShown) return;
		if (this.#deepLinkTimer !== null) clearTimeout(this.#deepLinkTimer);
		this.#deepLinkTimer = setTimeout(() => {
			this.#deepLinkTimer = null;
			if (document.visibilityState !== "visible") return;
			this.#hintShown = true;
			const hint = this.#overlay?.querySelector(".hint");
			if (hint instanceof HTMLElement) hint.classList.add("is-visible");
		}, DEEP_LINK_GRACE);
	}

	#paintCode(body: HTMLElement, view: ModalView): void {
		const renderer = this.#codeRenderer;
		if (renderer === null) return;

		// Computed styles on a disconnected element are the browser's defaults,
		// not ours, so drawing before the modal is in the document produces a
		// code in black on transparent. `connectedCallback` renders again, and
		// that is the pass that draws.
		if (!this.isConnected) return;

		// The host takes the slot's place whenever the body was rebuilt, so the
		// drawing it already holds survives the rebuild.
		const slot = body.querySelector(".code");
		if (slot instanceof HTMLElement && slot !== this.#codeHost) {
			slot.replaceWith(this.#codeHost);
		}
		const initiating = view.phase.kind === "initiating";
		if (view.phase.kind !== "awaiting-approval" && !initiating) return;

		// All three colours come off the probe, an empty element that resolves
		// `--bchc-code-ink` into its `color`, `--bchc-code-paper` into its
		// background and the accent into `accent-color`, a property the
		// browser has to compute to a real colour. A dedicated element rather
		// than the tile itself: the tile's colours transition — its paper goes
		// when the attempt fails and comes back on retry — and a code drawn
		// from a value caught mid-transition is a code drawn in the wrong ink.
		const probe = this.#codeHost.parentElement?.querySelector(".probe");
		if (!(probe instanceof HTMLElement)) return;
		const tileStyles = getComputedStyle(probe);

		const protocol = view.protocols.find((entry) => entry.id === view.protocol);
		void renderCode(renderer, this.#codeHost, {
			link:
				view.phase.kind === "awaiting-approval"
					? view.phase.link
					: PLACEHOLDER_LINK,
			// The stand-in carries the mark too, so what arrives is the same
			// object at full strength rather than a different one.
			mark: protocol?.mark ?? null,
			foreground: tileStyles.color,
			background: tileStyles.backgroundColor,
			accent: tileStyles.accentColor,
			placeholder: initiating,
		});
	}
}

if (!customElements.get("bchc-modal")) {
	customElements.define("bchc-modal", BchcModal);
}
