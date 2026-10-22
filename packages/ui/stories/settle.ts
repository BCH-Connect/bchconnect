// Finite animations only: the waiting dots and the skeleton sweep loop forever.
function runningAnimations(root: Document | ShadowRoot): Animation[] {
	const own = root
		.getAnimations()
		.filter(
			(animation) =>
				animation.playState === "running" &&
				animation.effect?.getComputedTiming().endTime !== Infinity,
		);
	const nested = [...root.querySelectorAll("*")].flatMap((element) =>
		element.shadowRoot === null ? [] : runningAnimations(element.shadowRoot),
	);
	return [...own, ...nested];
}

function nextFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Resolves once two frames in a row pass with no finite animation running.
 *
 * Storybook's `waitForAnimations` checks once, 100 ms in, so on slow CI frames
 * it misses motion that starts a frame later, or that a swap chains on after
 * an earlier animation finishes.
 */
export async function settle(): Promise<void> {
	let quietFrames = 0;
	while (quietFrames < 2) {
		await nextFrame();
		const running = runningAnimations(document);
		if (running.length === 0) {
			quietFrames += 1;
			continue;
		}
		quietFrames = 0;
		await Promise.allSettled(running.map((animation) => animation.finished));
	}
}
