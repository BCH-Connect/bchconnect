/**
 * A finger-drag probe for the lab, loaded only behind `?probe`.
 *
 * A phone has no console, so the numbers go on the page itself: the display
 * rate continuously, and the previous drag's timing until the next one ends.
 * One `requestAnimationFrame` loop does all the measuring; the only read that
 * can force layout is the card's computed transform, once per frame, and
 * only while a drag is in progress.
 */

const FRAME_HISTORY_MS = 1000;
const RENDER_INTERVAL_MS = 250;

const panel = document.createElement("pre");
panel.style.cssText =
	"position:fixed;top:0;left:0;right:0;z-index:2147483647;margin:0;" +
	"padding:8px 10px;max-height:36vh;overflow:hidden;pointer-events:none;" +
	"background:rgba(10,10,10,0.85);color:#8CFFB0;" +
	"font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;";
document.documentElement.append(panel);

function median(values) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

function percentile(values, p) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function inModal(selector) {
	return document.querySelector("bchc-modal")?.shadowRoot?.querySelector(selector);
}

// Reads the drawer card's translateY; null while no modal is open.
function cardOffsetY() {
	const card = inModal(".card");
	if (!(card instanceof HTMLElement)) return null;
	const transform = getComputedStyle(card).transform;
	if (transform === "none") return 0;
	return new DOMMatrixReadOnly(transform).m42;
}

let displayHz = 0;
let previousFrameTime = null;
let recentFrames = [];

let activeTouchId = null;
// True from touchstart until the first touchmove, which is where a drag actually begins.
let armed = false;
let drag = null;
let lastReport = "Drag the sheet to measure it.";
let lastRenderTime = 0;
let openReport = "open: not seen yet";
// Frame intervals while the modal enters, which the compositor animates without any script.
let opening = null;

// A message posted from a frame callback is handled right after that frame's
// style, layout, paint and commit, so the gap is the main thread's share of the frame.
const afterFrame = new MessageChannel();
let frameStartedAt = 0;
// The same gap with nothing moving: what the browser's own scheduling adds, to read the drag's against.
let idleMain = [];
afterFrame.port1.onmessage = () => {
	const gap = performance.now() - frameStartedAt;
	if (drag !== null) {
		drag.mainSamples.push(gap);
		return;
	}
	idleMain.push(gap);
	if (idleMain.length > 120) idleMain.shift();
};

function startDrag(y) {
	const now = performance.now();
	drag = {
		startTime: now,
		lastFrameTime: now,
		frames: 0,
		frameIntervals: [],
		touchMoveCount: 0,
		movesSincePreviousFrame: 0,
		moveBuckets: [0, 0, 0],
		startFingerY: y,
		lastFingerY: y,
		lagSamples: [],
		mainSamples: [],
		blur: (() => {
			const scrim = inModal(".scrim");
			if (!(scrim instanceof HTMLElement)) return "n/a";
			const styles = getComputedStyle(scrim);
			return styles.backdropFilter || styles.webkitBackdropFilter || "none";
		})(),
		pointerSamples: 0,
		pointerSamplesSeen: false,
	};
}

function endDrag() {
	if (drag === null) return;
	const duration = performance.now() - drag.startTime;
	const seconds = duration / 1000;
	const fps = seconds > 0 ? drag.frames / seconds : 0;

	const medianFrame = median(drag.frameIntervals);
	const p95Frame = percentile(drag.frameIntervals, 0.95);
	const worstFrame =
		drag.frameIntervals.length > 0 ? Math.max(...drag.frameIntervals) : 0;

	const moveRate = seconds > 0 ? drag.touchMoveCount / seconds : 0;
	const pointerRate = drag.pointerSamplesSeen
		? `${(drag.pointerSamples / seconds).toFixed(0)}/s`
		: "n/a";

	const medianLag = median(drag.lagSamples);
	const worstLag = drag.lagSamples.length > 0 ? Math.max(...drag.lagSamples) : 0;

	const onTime = drag.frameIntervals.filter((ms) => ms <= 20).length;
	const late = drag.frameIntervals.filter((ms) => ms > 20 && ms <= 40).length;
	const veryLate = drag.frameIntervals.filter((ms) => ms > 40).length;
	const worstMain = drag.mainSamples.length > 0 ? Math.max(...drag.mainSamples) : 0;
	const speed =
		seconds > 0 ? Math.abs(drag.lastFingerY - drag.startFingerY) / seconds : 0;

	lastReport = [
		`drag: ${duration.toFixed(0)} ms  finger ${speed.toFixed(0)} px/s  blur ${drag.blur}`,
		`frames: ${drag.frames} (${fps.toFixed(1)} fps)`,
		`frame ms: median ${medianFrame.toFixed(1)}  p95 ${p95Frame.toFixed(1)}  worst ${worstFrame.toFixed(1)}`,
		`frame mix: on time ${onTime}  late ${late}  very late ${veryLate}`,
		`main ms: median ${median(drag.mainSamples).toFixed(1)}  p95 ${percentile(drag.mainSamples, 0.95).toFixed(1)}  worst ${worstMain.toFixed(1)}`,
		`touchmove: ${drag.touchMoveCount} (${moveRate.toFixed(1)}/s)`,
		`moves/frame: 0=${drag.moveBuckets[0]} 1=${drag.moveBuckets[1]} 2+=${drag.moveBuckets[2]}`,
		`pointer raw: ${pointerRate}`,
		`lag px: median ${medianLag.toFixed(1)}  worst ${worstLag.toFixed(1)}`,
	].join("\n");
	drag = null;
	render();
}

function findTouch(list, id) {
	for (let index = 0; index < list.length; index += 1) {
		const touch = list.item(index);
		if (touch !== null && touch.identifier === id) return touch;
	}
	return null;
}

function onTouchStart(event) {
	if (activeTouchId !== null) return;
	const touch = event.changedTouches.item(0);
	if (touch === null) return;
	activeTouchId = touch.identifier;
	armed = true;
}

function onTouchMove(event) {
	if (activeTouchId === null) return;
	const touch =
		findTouch(event.changedTouches, activeTouchId) ??
		findTouch(event.touches, activeTouchId);
	if (touch === null) return;
	if (armed) {
		armed = false;
		startDrag(touch.clientY);
	}
	if (drag === null) return;
	drag.touchMoveCount += 1;
	drag.movesSincePreviousFrame += 1;
	drag.lastFingerY = touch.clientY;
}

function onTouchEnd(event) {
	if (activeTouchId === null) return;
	if (findTouch(event.changedTouches, activeTouchId) === null) return;
	activeTouchId = null;
	armed = false;
	endDrag();
}

function onPointerMove(event) {
	if (event.pointerType !== "touch" || drag === null) return;
	drag.pointerSamplesSeen = true;
	const coalesced =
		typeof event.getCoalescedEvents === "function"
			? event.getCoalescedEvents()
			: [];
	drag.pointerSamples += coalesced.length > 0 ? coalesced.length : 1;
}

window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
window.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
window.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });

function render() {
	panel.textContent = `display: ${displayHz.toFixed(1)} Hz  idle main ${median(idleMain).toFixed(1)} ms\n${openReport}\n\n${lastReport}`;
}

new MutationObserver((records) => {
	for (const record of records) {
		for (const node of record.addedNodes) {
			if (node instanceof Element && node.localName === "bchc-modal") {
				opening = { until: performance.now() + 700, last: null, intervals: [] };
			}
		}
	}
}).observe(document.body, { childList: true });

function tick(now) {
	requestAnimationFrame(tick);

	if (previousFrameTime !== null) {
		recentFrames.push({ at: now, interval: now - previousFrameTime });
	}
	previousFrameTime = now;
	while (recentFrames.length > 0 && now - recentFrames[0].at > FRAME_HISTORY_MS) {
		recentFrames.shift();
	}
	const intervals = recentFrames.map((frame) => frame.interval);
	if (intervals.length > 0) displayHz = 1000 / median(intervals);

	if (opening !== null) {
		if (opening.last !== null) opening.intervals.push(now - opening.last);
		opening.last = now;
		if (now >= opening.until) {
			const total = opening.intervals.reduce((sum, ms) => sum + ms, 0);
			const late = opening.intervals.filter((ms) => ms > 20).length;
			openReport = `open: ${opening.intervals.length} frames (${total > 0 ? ((opening.intervals.length * 1000) / total).toFixed(1) : "0"} fps)  late ${late}  worst ${Math.max(...opening.intervals).toFixed(1)}`;
			opening = null;
		}
	}

	frameStartedAt = now;
	afterFrame.port2.postMessage(0);

	if (drag !== null) {
		const bucket = drag.movesSincePreviousFrame >= 2 ? 2 : drag.movesSincePreviousFrame;
		drag.moveBuckets[bucket] += 1;
		drag.movesSincePreviousFrame = 0;
		if (drag.frames > 0) drag.frameIntervals.push(now - drag.lastFrameTime);
		drag.lastFrameTime = now;
		drag.frames += 1;

		const cardY = cardOffsetY();
		if (cardY !== null) {
			const travel = drag.lastFingerY - drag.startFingerY;
			drag.lagSamples.push(Math.abs(travel - cardY));
		}
	}

	// Not during a drag: repainting the panel would add to the frames being measured.
	if (drag === null && now - lastRenderTime >= RENDER_INTERVAL_MS) {
		lastRenderTime = now;
		render();
	}
}
requestAnimationFrame(tick);
render();
