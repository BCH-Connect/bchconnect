import { describe, expect, it } from "vitest";
import {
	DISMISS_VELOCITY,
	decideRelease,
	intent,
	recordVelocitySample,
	type VelocitySample,
	velocityAt,
} from "../src/gesture.ts";

describe("intent", () => {
	it("stays undecided below the 8px distance", () => {
		expect(intent(3, 5, false, false)).toBeNull();
		expect(intent(-5, -3, false, true)).toBeNull();
	});

	it("drags downward from the top", () => {
		expect(intent(0, 10, false, false)).toBe("drag");
	});

	it("passes downward while already scrolled", () => {
		expect(intent(0, 10, true, false)).toBe("pass");
	});

	it("passes upward when the scroller has room left", () => {
		expect(intent(0, -10, false, true)).toBe("pass");
	});

	it("drags upward (rubber band) when the scroller has no room left", () => {
		expect(intent(0, -10, false, false)).toBe("drag");
	});

	it("passes on horizontal or diagonal-leaning-horizontal movement", () => {
		expect(intent(10, 2, false, false)).toBe("pass");
		expect(intent(-10, 0, false, true)).toBe("pass");
		expect(intent(10, 10, false, false)).toBe("pass");
	});
});

describe("velocity tracking", () => {
	it("reports velocity across the sliding window", () => {
		let samples: readonly VelocitySample[] = [];
		samples = recordVelocitySample(samples, 0, 0);
		samples = recordVelocitySample(samples, 40, 20);
		samples = recordVelocitySample(samples, 80, 40);
		expect(velocityAt(samples, 80)).toBeCloseTo(0.5);
	});

	it("is 0 after a pause longer than the window", () => {
		let samples: readonly VelocitySample[] = [];
		samples = recordVelocitySample(samples, 0, 0);
		samples = recordVelocitySample(samples, 20, 20);
		expect(velocityAt(samples, 200)).toBe(0);
	});

	it("is 0 with a single sample", () => {
		let samples: readonly VelocitySample[] = [];
		samples = recordVelocitySample(samples, 0, 0);
		expect(velocityAt(samples, 0)).toBe(0);
	});

	it("does not read a lone late twitch as a flick when earlier samples in the window are slow", () => {
		let samples: readonly VelocitySample[] = [];
		samples = recordVelocitySample(samples, 0, 0);
		samples = recordVelocitySample(samples, 20, 2);
		samples = recordVelocitySample(samples, 40, 4);
		samples = recordVelocitySample(samples, 60, 6);
		// A jump on the very last sample, averaged against the slow ones still in the window.
		samples = recordVelocitySample(samples, 80, 20);
		expect(velocityAt(samples, 80)).toBeLessThan(DISMISS_VELOCITY);
	});
});

describe("decideRelease", () => {
	it("dismisses when far enough down", () => {
		expect(decideRelease(200, 400, 0)).toBe(true);
	});

	it("dismisses on a downward flick short of the ratio", () => {
		expect(decideRelease(20, 400, 0.6)).toBe(true);
	});

	it("does not dismiss on an upward flick past the ratio", () => {
		expect(decideRelease(200, 400, -0.6)).toBe(false);
	});

	it("never dismisses at zero or negative offset", () => {
		expect(decideRelease(0, 400, 10)).toBe(false);
		expect(decideRelease(-50, 400, 10)).toBe(false);
	});
});
