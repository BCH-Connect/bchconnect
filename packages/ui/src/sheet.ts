import { tempoOf } from "./motion.ts";

/** Past this fraction of the sheet's height, releasing dismisses it. */
const DISMISS_RATIO = 0.35;

/** Past this speed (px/ms) a flick dismisses regardless of distance. */
const DISMISS_VELOCITY = 0.45;

/** How far the sheet may be pulled above its resting place before it stops. */
const RUBBER_LIMIT = 48;

// Divides overshoot by an amount that grows with it, so the sheet stiffens instead of hitting a wall.
function rubberBand(overshoot: number): number {
	return (overshoot * RUBBER_LIMIT) / (RUBBER_LIMIT + Math.abs(overshoot));
}

export interface SheetHandlers {
	readonly onDismiss: () => void;
	/** Whether dragging applies at all right now; false on a wide viewport. */
	readonly isActive: () => boolean;
}

// Moves the element via transform only, so dragging stays on the compositor.
export function draggableSheet(
	element: HTMLElement,
	handlers: SheetHandlers,
): () => void {
	let pointerId: number | null = null;
	let startY = 0;
	let lastY = 0;
	let lastTime = 0;
	let velocity = 0;
	let offset = 0;

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

	const onPointerDown = (event: PointerEvent): void => {
		if (!handlers.isActive() || pointerId !== null) return;
		// A drag that starts on a control is that control's business.
		if (
			event.target instanceof Element &&
			event.target.closest("button, a, select, input") !== null
		) {
			return;
		}
		pointerId = event.pointerId;
		startY = event.clientY;
		lastY = event.clientY;
		lastTime = event.timeStamp;
		velocity = 0;
		element.style.transition = "";
		element.setPointerCapture(event.pointerId);
	};

	const onPointerMove = (event: PointerEvent): void => {
		if (pointerId !== event.pointerId) return;
		const delta = event.clientY - startY;
		const elapsed = event.timeStamp - lastTime;
		if (elapsed > 0) velocity = (event.clientY - lastY) / elapsed;
		lastY = event.clientY;
		lastTime = event.timeStamp;

		// Downward is 1:1; upward meets resistance (rubberBand).
		setOffset(delta >= 0 ? delta : -rubberBand(-delta));
		// Only once clearly a drag, so a tap still reaches what's underneath.
		if (Math.abs(delta) > 4) event.preventDefault();
	};

	const release = (event: PointerEvent): void => {
		if (pointerId !== event.pointerId) return;
		pointerId = null;
		element.releasePointerCapture(event.pointerId);

		const height = element.getBoundingClientRect().height;
		const farEnough = offset > height * DISMISS_RATIO;
		const fastEnough = velocity > DISMISS_VELOCITY;
		if (farEnough || fastEnough) {
			// Continues at the gesture's speed instead of snapping.
			element.style.transition = `transform var(--bchc-duration-base) var(--bchc-ease-out)`;
			setOffset(height);
			handlers.onDismiss();
			return;
		}
		settle();
	};

	element.addEventListener("pointerdown", onPointerDown);
	element.addEventListener("pointermove", onPointerMove);
	element.addEventListener("pointerup", release);
	element.addEventListener("pointercancel", release);

	return () => {
		element.removeEventListener("pointerdown", onPointerDown);
		element.removeEventListener("pointermove", onPointerMove);
		element.removeEventListener("pointerup", release);
		element.removeEventListener("pointercancel", release);
	};
}
