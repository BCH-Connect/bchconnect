/**
 * Drag-to-dismiss for the mobile drawer.
 *
 * The thing that makes a good drawer feel like a physical object is that it
 * answers your finger continuously and commits on how fast you were moving, not
 * on where you happened to let go. A sheet that only animates on release is a
 * modal with a slide transition.
 *
 * Deliberately not included: scaling the page behind the drawer. That effect
 * works by transforming the host document's body, and this component is a guest
 * inside someone else's dapp — it has no business transforming their page.
 *
 * Built on pointer events, so mouse, touch and pen are one code path.
 */

/** Past this fraction of the sheet's height, releasing dismisses it. */
const DISMISS_RATIO = 0.35;

/** Past this speed (px/ms) a flick dismisses regardless of distance. */
const DISMISS_VELOCITY = 0.45;

/** How far the sheet may be pulled above its resting place before it stops. */
const RUBBER_LIMIT = 48;

/**
 * Resistance above the resting position. Divides the overshoot by an amount
 * that grows with the overshoot, so the sheet gets stiffer the harder it is
 * pulled rather than stopping at a wall.
 */
function rubberBand(overshoot: number): number {
	return (overshoot * RUBBER_LIMIT) / (RUBBER_LIMIT + Math.abs(overshoot));
}

export interface SheetHandlers {
	/** Called when the gesture commits to dismissing. */
	readonly onDismiss: () => void;
	/** Whether dragging applies at all right now — false on a wide viewport. */
	readonly isActive: () => boolean;
}

/**
 * Makes `element` draggable downward to dismiss.
 *
 * Returns a teardown function. The element is moved with a transform and never
 * re-laid-out, so dragging stays on the compositor.
 */
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
		// Handing the spring back to CSS keeps one motion grammar: the sheet
		// returns on the same curve everything else in the system settles on.
		element.style.transition = `transform var(--bchc-duration-base) var(--bchc-ease-settle)`;
		setOffset(0);
		element.addEventListener(
			"transitionend",
			() => {
				element.style.transition = "";
			},
			{ once: true },
		);
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

		// Downward moves one-to-one with the finger; upward meets resistance,
		// which is what tells you the sheet is already home.
		setOffset(delta >= 0 ? delta : -rubberBand(-delta));
		// Only once the gesture is clearly a drag, so a tap still reaches
		// whatever is underneath.
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
			// Carry the gesture through instead of snapping: the sheet leaves at
			// the speed it was already travelling.
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
