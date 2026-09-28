import {
	decideRelease,
	intent,
	recordVelocitySample,
	rubberBand,
	type VelocitySample,
	velocityAt,
} from "./gesture.ts";
import { tempoOf } from "./motion.ts";

export interface SheetHandlers {
	readonly onDismiss: () => void;
	/** Whether dragging applies at all right now; false on a wide viewport. */
	readonly isActive: () => boolean;
}

type Phase = "idle" | "pressed" | "dragging" | "passed";

/** After a settle or dismiss, how long a resulting click stays swallowed. */
const CLICK_GUARD_MS = 100;

// Moves the element via transform only, so dragging stays on the compositor.
export function draggableSheet(
	element: HTMLElement,
	handlers: SheetHandlers,
): () => void {
	let phase: Phase = "idle";
	let pointerId: number | null = null;
	let touchId: number | null = null;
	let pressTarget: EventTarget | null = null;
	let startX = 0;
	let startY = 0;
	let dragOriginY = 0;
	let offset = 0;
	let samples: readonly VelocitySample[] = [];
	let justDragged = false;
	let clickGuardTimeout: ReturnType<typeof setTimeout> | null = null;

	const setOffset = (next: number): void => {
		offset = next;
		element.style.transform = next === 0 ? "" : `translateY(${next}px)`;
	};

	const settle = (): void => {
		element.style.transition = `transform var(--bchc-duration-base) var(--bchc-ease-settle)`;
		setOffset(0);
		let done = false;
		const finish = (): void => {
			if (done) return;
			done = true;
			element.removeEventListener("transitionend", finish);
			element.removeEventListener("transitioncancel", finish);
			clearTimeout(fallback);
			element.style.transition = "";
		};
		element.addEventListener("transitionend", finish, { once: true });
		element.addEventListener("transitioncancel", finish, { once: true });
		// Fallback: neither event fires when the offset was already 0.
		const fallback = setTimeout(finish, tempoOf(element).base + 50);
	};

	const dismiss = (height: number): void => {
		// Continues at the gesture's speed instead of snapping.
		element.style.transition = `transform var(--bchc-duration-base) var(--bchc-ease-out)`;
		setOffset(height);
		handlers.onDismiss();
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
		while (node !== null && node !== element) {
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
			element.style.transition = "";
			samples = recordVelocitySample(samples, time, y);
			return "decided-drag";
		}
		if (phase === "dragging") {
			const delta = y - dragOriginY;
			samples = recordVelocitySample(samples, time, y);
			setOffset(delta >= 0 ? delta : -rubberBand(-delta));
			return "continue";
		}
		return "ignore";
	};

	const finishRelease = (time: number): void => {
		const wasDragging = phase === "dragging";
		phase = "idle";
		pressTarget = null;
		if (!wasDragging) return;
		const height = element.getBoundingClientRect().height;
		if (decideRelease(offset, height, velocityAt(samples, time))) {
			dismiss(height);
		} else {
			settle();
		}
		armClickGuard();
	};

	const finishCancel = (): void => {
		const wasDragging = phase === "dragging";
		phase = "idle";
		pressTarget = null;
		if (!wasDragging) return;
		// A cancelled gesture never dismisses, only settles.
		settle();
		armClickGuard();
	};

	// A press that ended where no listener could see it would otherwise block every later one.
	const abandon = (): void => {
		pointerId = null;
		touchId = null;
		finishCancel();
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
		if (result === "decided-drag") element.setPointerCapture(event.pointerId);
		if (phase === "dragging" && event.cancelable) event.preventDefault();
	};

	const onPointerUp = (event: PointerEvent): void => {
		if (event.pointerType === "touch" || pointerId !== event.pointerId) return;
		if (element.hasPointerCapture(event.pointerId)) {
			element.releasePointerCapture(event.pointerId);
		}
		pointerId = null;
		finishRelease(event.timeStamp);
	};

	const onPointerCancel = (event: PointerEvent): void => {
		if (event.pointerType === "touch" || pointerId !== event.pointerId) return;
		if (element.hasPointerCapture(event.pointerId)) {
			element.releasePointerCapture(event.pointerId);
		}
		pointerId = null;
		finishCancel();
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
		finishCancel();
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

	element.addEventListener("pointerdown", onPointerDown);
	element.addEventListener("pointermove", onPointerMove);
	element.addEventListener("pointerup", onPointerUp);
	element.addEventListener("pointercancel", onPointerCancel);
	element.addEventListener("touchstart", onTouchStart, { passive: true });
	element.addEventListener("touchmove", onTouchMove, { passive: false });
	element.addEventListener("touchend", onTouchEnd);
	element.addEventListener("touchcancel", onTouchCancel);
	element.addEventListener("dragstart", onDragStart);
	element.addEventListener("click", onClickCapture, { capture: true });

	return () => {
		element.removeEventListener("pointerdown", onPointerDown);
		element.removeEventListener("pointermove", onPointerMove);
		element.removeEventListener("pointerup", onPointerUp);
		element.removeEventListener("pointercancel", onPointerCancel);
		element.removeEventListener("touchstart", onTouchStart);
		element.removeEventListener("touchmove", onTouchMove);
		element.removeEventListener("touchend", onTouchEnd);
		element.removeEventListener("touchcancel", onTouchCancel);
		element.removeEventListener("dragstart", onDragStart);
		element.removeEventListener("click", onClickCapture, { capture: true });
		if (clickGuardTimeout !== null) clearTimeout(clickGuardTimeout);
	};
}
