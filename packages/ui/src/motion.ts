// Web Animations API for motion CSS can't express: transitions from where
// something was, measured before/after a mutation. CSS owns the rest, and
// tempoOf() reads durations/curves so tokens.css stays the single tuning spot.

/** Motion tokens as the stylesheet resolved them for this element. */
export interface Tempo {
	readonly fast: number;
	readonly base: number;
	readonly slow: number;
	readonly out: string;
	readonly settle: string;
	readonly spring: string;
	readonly enter: string;
	readonly sheet: string;
	// The drawer's entrance and exit, as its keyframes in modal.css time them.
	readonly sheetIn: number;
	readonly sheetOut: number;
}

function milliseconds(value: string, fallback: number): number {
	const trimmed = value.trim();
	if (trimmed.endsWith("ms")) return Number.parseFloat(trimmed);
	if (trimmed.endsWith("s")) return Number.parseFloat(trimmed) * 1000;
	return fallback;
}

export function tempoOf(element: Element): Tempo {
	const styles = getComputedStyle(element);
	const read = (name: string) => styles.getPropertyValue(name);
	const base = milliseconds(read("--bchc-duration-base"), 320);
	const slow = milliseconds(read("--bchc-duration-slow"), 560);
	return {
		fast: milliseconds(read("--bchc-duration-fast"), 160),
		base,
		slow,
		out: read("--bchc-ease-out").trim() || "ease-out",
		settle: read("--bchc-ease-settle").trim() || "ease-out",
		spring: read("--bchc-ease-spring").trim() || "ease-out",
		enter: read("--bchc-ease-enter").trim() || "ease-out",
		sheet: read("--bchc-ease-sheet").trim() || "ease-out",
		sheetIn: slow * 0.9,
		sheetOut: base * 1.1,
	};
}

/** Wait for every animation under `root` to finish, however it finishes (a cancelled one rejects its `finished` promise). */
export async function animationsFinished(root: Element): Promise<void> {
	// Forces the next style pass, so a class toggled this tick has already produced its animations below.
	void (root as HTMLElement).offsetHeight;
	const finite = root
		.getAnimations({ subtree: true })
		// A loop (a pulse, a sweep) never finishes.
		.filter(
			(animation) => animation.effect?.getTiming().iterations !== Infinity,
		);
	await Promise.allSettled(finite.map((animation) => animation.finished));
}

// Waits only for CSS animations named in `names`; script-driven animations
// carry no `animationName` and are never waited on.
export async function namedAnimationsFinished(
	root: Element,
	names: ReadonlySet<string>,
): Promise<void> {
	void (root as HTMLElement).offsetHeight;
	const matching = root
		.getAnimations({ subtree: true })
		.filter(
			(animation): animation is CSSAnimation =>
				"animationName" in animation &&
				names.has((animation as CSSAnimation).animationName),
		);
	await Promise.allSettled(matching.map((animation) => animation.finished));
}

// Script-driven, not a stylesheet rule, so a body rebuilt mid-entrance
// doesn't replay it on new rows; runs only on elements present at first paint.
export function enter(elements: Iterable<Element>, tempo: Tempo): void {
	let index = 0;
	for (const element of elements) {
		const heavy = element.classList.contains("footer");
		element.animate(
			[
				{ opacity: 0, transform: `translateY(${heavy ? 22 : 12}px)` },
				{ opacity: 1, offset: 0.3 },
				{ opacity: 1, transform: "none" },
			],
			{
				duration: tempo.base,
				easing: tempo.out,
				delay: tempo.fast / 5 + Math.min(index, 8) * 12,
				fill: "backwards",
			},
		);
		index += 1;
	}
}

// Animating `height` is normally avoided, but this runs once, briefly, on
// one element; `overflow: clip` keeps incoming content from spilling out.
export function morphHeight(element: HTMLElement, mutate: () => void): void {
	const before = element.getBoundingClientRect().height;
	mutate();
	const after = element.getBoundingClientRect().height;
	if (Math.abs(after - before) < 1) return;

	const tempo = tempoOf(element);
	element.style.overflow = "clip";
	const animation = element.animate(
		[{ height: `${before}px` }, { height: `${after}px` }],
		{ duration: tempo.base, easing: tempo.settle },
	);
	animation.finished
		.catch(() => undefined)
		.finally(() => {
			element.style.overflow = "";
		});
}

// The drawer is anchored to the bottom of the viewport, so a height change moves its top
// edge. The new layout applies at once and the card travels from where that edge was.
export function slideSheet(card: HTMLElement, mutate: () => void): void {
	const before = card.getBoundingClientRect().height;
	mutate();
	const delta = card.getBoundingClientRect().height - before;
	if (Math.abs(delta) < 1) return;

	const tempo = tempoOf(card);
	// A shorter sheet starts raised, which would show the page under its bottom edge.
	if (delta < 0) card.style.setProperty("--bchc-sheet-travel", `${-delta}px`);
	card
		.animate(
			[{ transform: `translate3d(0, ${delta}px, 0)` }, { transform: "none" }],
			{
				duration: delta > 0 ? tempo.sheetIn : tempo.sheetOut,
				easing: tempo.sheet,
			},
		)
		.finished.catch(() => undefined)
		.finally(() => card.style.removeProperty("--bchc-sheet-travel"));
}

// `direction`: forward into a sub-screen, back out of one, or 0 for a
// same-screen change, which rises instead of sliding sideways.
export function crossfade(
	host: HTMLElement,
	mutate: () => void,
	direction: -1 | 0 | 1,
): void {
	const tempo = tempoOf(host);
	const outgoing = host.cloneNode(true) as HTMLElement;
	outgoing.classList.add("outgoing");
	outgoing.setAttribute("aria-hidden", "true");
	outgoing.inert = true;
	// `.outgoing` is absolute via CSS; only geometry is set here so it stays pinned.
	outgoing.style.top = `${host.offsetTop}px`;
	outgoing.style.left = `${host.offsetLeft}px`;
	outgoing.style.width = `${host.offsetWidth}px`;

	mutate();

	host.parentElement?.insertBefore(outgoing, host);
	// Forward/back is relative to reading order, so it flips with direction.
	const sign = getComputedStyle(host).direction === "rtl" ? -1 : 1;
	const away =
		direction === 0
			? "translateY(-6px)"
			: `translateX(${-14 * direction * sign}px)`;
	const from =
		direction === 0
			? "translateY(8px)"
			: `translateX(${14 * direction * sign}px)`;

	outgoing
		.animate(
			[
				{ opacity: 1, transform: "none" },
				{ opacity: 0, transform: away },
			],
			{ duration: tempo.fast, easing: tempo.out, fill: "forwards" },
		)
		.finished.catch(() => undefined)
		.finally(() => outgoing.remove());

	host.animate(
		[
			{ opacity: 0, transform: from },
			{ opacity: 1, transform: "none" },
		],
		{
			duration: tempo.base,
			easing: tempo.out,
			delay: tempo.fast / 2,
			fill: "backwards",
		},
	);
}

// Keyed by element: the same key while a swap is under way, or after it, is not swapped again.
const lastRetext = new WeakMap<Element, string>();

/**
 * Fade an element's content out, let `swap` replace it, then fade it back in,
 * so a label never just flips. `key` names the new content; `swap` may return
 * a promise that settles once the new content is in place.
 */
export function retext(
	element: HTMLElement,
	key: string,
	swap: () => unknown,
): void {
	if (lastRetext.get(element) === key) return;
	lastRetext.set(element, key);
	const tempo = tempoOf(element);
	const fade = element.animate([{ opacity: 1 }, { opacity: 0 }], {
		duration: tempo.fast / 2,
		easing: "linear",
		fill: "forwards",
	});
	fade.finished
		.catch(() => undefined)
		.then(swap)
		.finally(() => {
			fade.cancel();
			element.animate(
				[
					{ opacity: 0, transform: "translateY(3px)" },
					{ opacity: 1, transform: "none" },
				],
				{ duration: tempo.base, easing: tempo.out },
			);
		});
}
