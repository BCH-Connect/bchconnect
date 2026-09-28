import {
	decideRelease,
	intent,
	recordVelocitySample,
	releaseDuration,
	rubberBand,
	scrimOpacity,
	type VelocitySample,
	velocityAt,
} from "./gesture.ts";
import { tempoOf } from "./motion.ts";

export interface SheetHandlers {
	/** Called once dismissal is decided. `settled` resolves once the release animation ends, however it ends. */
	readonly onDismiss: (settled: Promise<void>) => void;
	/** Whether dragging applies at all right now; false on a wide viewport. */
	readonly isActive: () => boolean;
}

export interface DraggableSheet {
	/**
	 * Freezes the current position and opacity inline and cancels any
	 * running drag/release animation, so a caller-driven exit (a CSS
	 * animation, typically) can safely take over from exactly here.
	 */
	readonly commit: () => void;
	/** `commit`, plus removes the event listeners. Call once, when the sheet is torn down. */
	readonly release: () => void;
}

type Phase = "idle" | "pressed" | "dragging" | "passed";

/** After a settle or dismiss, how long a resulting click stays swallowed. */
const CLICK_GUARD_MS = 100;

const SHEET_EASE_FALLBACK = "cubic-bezier(0.32, 0.72, 0, 1)";

function sheetEase(element: Element): string {
	const value = getComputedStyle(element)
		.getPropertyValue("--bchc-ease-sheet")
		.trim();
	return value === "" ? SHEET_EASE_FALLBACK : value;
}

function readOffset(element: HTMLElement): number {
	return new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
}

function readOpacity(element: HTMLElement): number {
	const value = Number.parseFloat(getComputedStyle(element).opacity);
	return Number.isNaN(value) ? 1 : value;
}

function transformFor(offsetPx: number): string {
	return offsetPx === 0 ? "" : `translate3d(0, ${offsetPx}px, 0)`;
}

// Only the transform/opacity animations, so an unrelated one (e.g. `morphHeight`'s on the same card) is left alone.
function animationsAffecting(element: Element, property: string): Animation[] {
	return element
		.getAnimations()
		.filter(
			(animation) =>
				animation.effect instanceof KeyframeEffect &&
				animation.effect.getKeyframes().some((frame) => property in frame),
		);
}

// Moves the card and scrim via transform/opacity only, so dragging stays on
// the compositor. `card` and `scrim` must share one animated clock: every
// hand-off between a CSS animation, an inline style and a WAAPI animation
// happens synchronously, in the same task, from whatever is on screen.
export function draggableSheet(
	card: HTMLElement,
	scrim: HTMLElement,
	handlers: SheetHandlers,
): DraggableSheet {
	let phase: Phase = "idle";
	let pointerId: number | null = null;
	let touchId: number | null = null;
	let pressTarget: EventTarget | null = null;
	let startX = 0;
	let startY = 0;
	let dragOriginY = 0;
	let dragBaseOffset = 0;
	let dragHeight = 0;
	let offset = 0;
	let samples: readonly VelocitySample[] = [];
	let justDragged = false;
	let clickGuardTimeout: ReturnType<typeof setTimeout> | null = null;

	let rafId: number | null = null;
	let cardAnimation: Animation | null = null;
	let scrimAnimation: Animation | null = null;
	// Bumped on every freeze/new release, so a superseded release's finish
	// handler (its `finished` promise still settles after a cancel) can tell
	// it no longer owns the sheet and must not touch its styles.
	let releaseToken = 0;

	const setWillChange = (active: boolean): void => {
		card.style.willChange = active ? "transform" : "";
		scrim.style.willChange = active ? "opacity" : "";
	};

	const cancelScheduledWrite = (): void => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	};

	const scheduleWrite = (): void => {
		if (rafId !== null) return;
		rafId = requestAnimationFrame(() => {
			rafId = null;
			card.style.transform = `translate3d(0, ${offset}px, 0)`;
			scrim.style.opacity = String(scrimOpacity(offset, dragHeight));
		});
	};

	// Reads whatever is currently on screen (drag, CSS entrance, or a settle
	// in flight), commits it as a plain inline style, then cancels every
	// animation on both elements — in that order, so nothing jumps.
	const freeze = (): number => {
		releaseToken += 1;
		const currentOffset = readOffset(card);
		const currentOpacity = readOpacity(scrim);
		for (const animation of animationsAffecting(card, "transform")) {
			animation.cancel();
		}
		for (const animation of animationsAffecting(scrim, "opacity")) {
			animation.cancel();
		}
		cardAnimation = null;
		scrimAnimation = null;
		offset = currentOffset;
		card.style.transform = transformFor(currentOffset);
		scrim.style.opacity = String(currentOpacity);
		return currentOffset;
	};

	const startRelease = (
		target: number,
		velocity: number,
		dismissing: boolean,
	): void => {
		const fromOffset = offset;
		const fromOpacity = scrimOpacity(offset, dragHeight);
		const remaining = target - fromOffset;
		// Speed toward `target`; zero or negative when the finger was still or moving away.
		const speed = remaining === 0 ? 0 : velocity * Math.sign(remaining);
		const tempo = tempoOf(card);
		const longest = dismissing ? tempo.base * 1.1 : tempo.slow * 0.9;
		const duration = releaseDuration(Math.abs(remaining), speed, longest);
		const easing = sheetEase(card);
		const toOpacity = dismissing ? 0 : 1;

		setWillChange(true);
		releaseToken += 1;
		const token = releaseToken;
		cardAnimation = card.animate(
			[
				{ transform: `translate3d(0, ${fromOffset}px, 0)` },
				{ transform: `translate3d(0, ${target}px, 0)` },
			],
			{ duration, easing, fill: "forwards" },
		);
		scrimAnimation = scrim.animate(
			[{ opacity: fromOpacity }, { opacity: toOpacity }],
			{ duration, easing, fill: "forwards" },
		);
		offset = target;

		const bothFinished = Promise.allSettled([
			cardAnimation.finished,
			scrimAnimation.finished,
		]);
		if (dismissing) handlers.onDismiss(bothFinished.then(() => undefined));
		void bothFinished.then(() => {
			if (token !== releaseToken) return;
			cardAnimation?.cancel();
			scrimAnimation?.cancel();
			cardAnimation = null;
			scrimAnimation = null;
			setWillChange(false);
			if (dismissing) {
				// Stays off-screen: the caller removes the overlay once it sees `settled`.
				card.style.transform = `translate3d(0, ${target}px, 0)`;
				scrim.style.opacity = "0";
			} else {
				card.style.transform = "";
				scrim.style.opacity = "";
				offset = 0;
			}
		});
	};

	const armClickGuard = (): void => {
		justDragged = true;
		if (clickGuardTimeout !== null) clearTimeout(clickGuardTimeout);
		clickGuardTimeout = setTimeout(() => {
			justDragged = false;
			clickGuardTimeout = null;
		}, CLICK_GUARD_MS);
	};

	// Elements between the press and the sheet that own their own vertical scroll.
	const scrollersAbove = (target: EventTarget | null): Element[] => {
		const found: Element[] = [];
		let node = target instanceof Element ? target : null;
		while (node !== null && node !== card) {
			const overflowY = getComputedStyle(node).overflowY;
			if (overflowY === "auto" || overflowY === "scroll") found.push(node);
			node = node.parentElement;
		}
		return found;
	};

	const scrollState = (
		target: EventTarget | null,
	): { scrolled: boolean; scrollable: boolean } => {
		let scrolled = false;
		let scrollable = false;
		for (const node of scrollersAbove(target)) {
			if (node.scrollTop > 0) scrolled = true;
			if (node.scrollHeight - node.clientHeight - node.scrollTop > 1) {
				scrollable = true;
			}
		}
		return { scrolled, scrollable };
	};

	const press = (x: number, y: number, target: EventTarget | null): boolean => {
		if (!handlers.isActive() || phase !== "idle") return false;
		// Text inputs and native pickers own their own gestures.
		if (
			target instanceof Element &&
			target.closest("input, textarea, select") !== null
		) {
			return false;
		}
		phase = "pressed";
		pressTarget = target;
		startX = x;
		startY = y;
		samples = [];
		justDragged = false;
		if (clickGuardTimeout !== null) {
			clearTimeout(clickGuardTimeout);
			clickGuardTimeout = null;
		}
		return true;
	};

	type MoveResult = "continue" | "decided-drag" | "decided-pass" | "ignore";

	const move = (
		x: number,
		y: number,
		time: number,
		cancelable: boolean,
	): MoveResult => {
		if (phase === "pressed") {
			const dx = x - startX;
			const dy = y - startY;
			const { scrolled, scrollable } = scrollState(pressTarget);
			let decision = intent(dx, dy, scrolled, scrollable);
			// The browser already owns this gesture; it will not let us prevent it.
			if (decision === "drag" && !cancelable) decision = "pass";
			if (decision === null) return "continue";
			if (decision === "pass") {
				phase = "passed";
				return "decided-pass";
			}
			phase = "dragging";
			dragOriginY = y;
			dragBaseOffset = freeze();
			dragHeight = card.getBoundingClientRect().height;
			card.classList.add("is-dragging");
			setWillChange(true);
			samples = recordVelocitySample(samples, time, y);
			return "decided-drag";
		}
		if (phase === "dragging") {
			const raw = dragBaseOffset + (y - dragOriginY);
			samples = recordVelocitySample(samples, time, y);
			offset = raw >= 0 ? raw : -rubberBand(-raw);
			scheduleWrite();
			return "continue";
		}
		return "ignore";
	};

	const finishRelease = (time: number): void => {
		const wasDragging = phase === "dragging";
		phase = "idle";
		pressTarget = null;
		if (!wasDragging) return;
		cancelScheduledWrite();
		card.classList.remove("is-dragging");
		const velocity = velocityAt(samples, time);
		if (decideRelease(offset, dragHeight, velocity)) {
			startRelease(dragHeight, velocity, true);
		} else {
			startRelease(0, velocity, false);
		}
		armClickGuard();
	};

	const finishCancel = (time: number): void => {
		const wasDragging = phase === "dragging";
		phase = "idle";
		pressTarget = null;
		if (!wasDragging) return;
		cancelScheduledWrite();
		card.classList.remove("is-dragging");
		// A cancelled gesture never dismisses, only settles.
		startRelease(0, velocityAt(samples, time), false);
		armClickGuard();
	};

	// A press that ended where no listener could see it would otherwise block every later one.
	const abandon = (): void => {
		pointerId = null;
		touchId = null;
		finishCancel(performance.now());
	};

	const onPointerDown = (event: PointerEvent): void => {
		if (event.pointerType === "touch" || phase === "dragging") return;
		abandon();
		if (press(event.clientX, event.clientY, event.target)) {
			pointerId = event.pointerId;
		}
	};

	const onPointerMove = (event: PointerEvent): void => {
		if (event.pointerType === "touch" || pointerId !== event.pointerId) return;
		// No button held means the release happened where no listener saw it.
		if (event.buttons === 0) {
			abandon();
			return;
		}
		const result = move(
			event.clientX,
			event.clientY,
			event.timeStamp,
			event.cancelable,
		);
		if (result === "decided-drag") card.setPointerCapture(event.pointerId);
		if (phase === "dragging" && event.cancelable) event.preventDefault();
	};

	const onPointerUp = (event: PointerEvent): void => {
		if (event.pointerType === "touch" || pointerId !== event.pointerId) return;
		if (card.hasPointerCapture(event.pointerId)) {
			card.releasePointerCapture(event.pointerId);
		}
		pointerId = null;
		finishRelease(event.timeStamp);
	};

	const onPointerCancel = (event: PointerEvent): void => {
		if (event.pointerType === "touch" || pointerId !== event.pointerId) return;
		if (card.hasPointerCapture(event.pointerId)) {
			card.releasePointerCapture(event.pointerId);
		}
		pointerId = null;
		finishCancel(event.timeStamp);
	};

	const touchById = (list: TouchList, id: number): Touch | null => {
		for (let index = 0; index < list.length; index += 1) {
			const touch = list.item(index);
			if (touch !== null && touch.identifier === id) return touch;
		}
		return null;
	};

	const onTouchStart = (event: TouchEvent): void => {
		const touch = event.changedTouches.item(0);
		if (touch === null) return;
		// A second finger never takes over while the first is still down.
		if (touchId !== null && touchById(event.touches, touchId) !== null) return;
		if (phase === "dragging" && pointerId !== null) return;
		abandon();
		if (press(touch.clientX, touch.clientY, touch.target)) {
			touchId = touch.identifier;
		}
	};

	const onTouchMove = (event: TouchEvent): void => {
		if (touchId === null) return;
		const touch = touchById(event.changedTouches, touchId);
		if (touch === null) return;
		move(touch.clientX, touch.clientY, event.timeStamp, event.cancelable);
		if (phase === "dragging" && event.cancelable) event.preventDefault();
	};

	const onTouchEnd = (event: TouchEvent): void => {
		if (touchId === null) return;
		const touch = touchById(event.changedTouches, touchId);
		if (touch === null) return;
		touchId = null;
		finishRelease(event.timeStamp);
	};

	const onTouchCancel = (event: TouchEvent): void => {
		if (touchId === null) return;
		const touch = touchById(event.changedTouches, touchId);
		if (touch === null) return;
		touchId = null;
		finishCancel(event.timeStamp);
	};

	const onDragStart = (event: DragEvent): void => {
		// A mouse drag starting on a link or image is otherwise taken by native drag-and-drop.
		if (handlers.isActive()) event.preventDefault();
	};

	const onClickCapture = (event: MouseEvent): void => {
		if (!justDragged) return;
		justDragged = false;
		if (clickGuardTimeout !== null) {
			clearTimeout(clickGuardTimeout);
			clickGuardTimeout = null;
		}
		event.preventDefault();
		event.stopPropagation();
	};

	card.addEventListener("pointerdown", onPointerDown);
	card.addEventListener("pointermove", onPointerMove);
	card.addEventListener("pointerup", onPointerUp);
	card.addEventListener("pointercancel", onPointerCancel);
	card.addEventListener("touchstart", onTouchStart, { passive: true });
	card.addEventListener("touchmove", onTouchMove, { passive: false });
	card.addEventListener("touchend", onTouchEnd);
	card.addEventListener("touchcancel", onTouchCancel);
	card.addEventListener("dragstart", onDragStart);
	card.addEventListener("click", onClickCapture, { capture: true });

	const commit = (): void => {
		cancelScheduledWrite();
		// Outside drawer mode the card's motion is not this module's to touch.
		if (handlers.isActive()) freeze();
		pointerId = null;
		touchId = null;
		phase = "idle";
		pressTarget = null;
		card.classList.remove("is-dragging");
		setWillChange(false);
	};

	const release = (): void => {
		commit();
		card.removeEventListener("pointerdown", onPointerDown);
		card.removeEventListener("pointermove", onPointerMove);
		card.removeEventListener("pointerup", onPointerUp);
		card.removeEventListener("pointercancel", onPointerCancel);
		card.removeEventListener("touchstart", onTouchStart);
		card.removeEventListener("touchmove", onTouchMove);
		card.removeEventListener("touchend", onTouchEnd);
		card.removeEventListener("touchcancel", onTouchCancel);
		card.removeEventListener("dragstart", onDragStart);
		card.removeEventListener("click", onClickCapture, { capture: true });
		if (clickGuardTimeout !== null) clearTimeout(clickGuardTimeout);
	};

	return { commit, release };
}
