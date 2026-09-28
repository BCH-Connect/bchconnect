/**
 * Pure decision rules for the drawer's drag gesture. `sheet.ts` owns the DOM
 * events and calls into these; nothing here touches the DOM, so it runs the
 * same in a browser or under Node in tests.
 */

/** Below this travel (px, the larger of |dx| and |dy|) the gesture's direction is undecided. */
export const DECISION_DISTANCE = 8;

/** Past this fraction of the sheet's height, releasing dismisses it. */
export const DISMISS_RATIO = 0.35;

/** Past this speed (px/ms) a flick dismisses regardless of distance. */
export const DISMISS_VELOCITY = 0.45;

/** How far the sheet may be pulled above its resting place before it stops. */
export const RUBBER_LIMIT = 48;

/** How long a velocity sample stays in the sliding window (ms). */
export const VELOCITY_WINDOW = 80;

// Divides overshoot by an amount that grows with it, so the sheet stiffens instead of hitting a wall.
export function rubberBand(overshoot: number): number {
	return (overshoot * RUBBER_LIMIT) / (RUBBER_LIMIT + Math.abs(overshoot));
}

export type GestureIntent = "drag" | "pass" | null;

/**
 * Arbitrates a press that has moved (dx, dy) from its start. `scrolled` and
 * `scrollable` describe the nearest scroll container between the press and
 * the sheet: whether it is scrolled away from its top, and whether it can
 * still scroll further down.
 */
export function intent(
	dx: number,
	dy: number,
	scrolled: boolean,
	scrollable: boolean,
): GestureIntent {
	if (Math.max(Math.abs(dx), Math.abs(dy)) < DECISION_DISTANCE) return null;
	if (Math.abs(dx) >= Math.abs(dy)) return "pass";
	if (dy > 0) return scrolled ? "pass" : "drag";
	return scrollable ? "pass" : "drag";
}

export interface VelocitySample {
	readonly time: number;
	readonly y: number;
}

/** Appends a sample and drops every sample older than the window relative to it. */
export function recordVelocitySample(
	samples: readonly VelocitySample[],
	time: number,
	y: number,
): readonly VelocitySample[] {
	const cutoff = time - VELOCITY_WINDOW;
	return [...samples.filter((sample) => sample.time >= cutoff), { time, y }];
}

/**
 * Velocity (px/ms) across the sliding window, as of `time`. Zero with fewer
 * than two samples, a zero-length span, or when the newest sample is older
 * than the window relative to `time` (the finger paused before this call).
 */
export function velocityAt(
	samples: readonly VelocitySample[],
	time: number,
): number {
	const newest = samples[samples.length - 1];
	const oldest = samples[0];
	if (newest === undefined || oldest === undefined) return 0;
	if (samples.length < 2) return 0;
	if (time - newest.time > VELOCITY_WINDOW) return 0;
	const span = newest.time - oldest.time;
	if (span === 0) return 0;
	return (newest.y - oldest.y) / span;
}

/**
 * Whether releasing now dismisses the sheet: past the distance ratio or
 * flicking down fast enough, but never while flicking back up.
 */
export function decideRelease(
	offset: number,
	height: number,
	velocity: number,
): boolean {
	if (offset <= 0) return false;
	if (velocity < -DISMISS_VELOCITY) return false;
	return offset > height * DISMISS_RATIO || velocity > DISMISS_VELOCITY;
}
