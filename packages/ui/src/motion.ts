/**
 * Motion the stylesheet cannot express on its own.
 *
 * CSS carries every animation that starts from a known state: the entrance,
 * the exit, hover, the code writing itself in. What it cannot do is animate
 * *from where something was* — a wallet row that moved because another
 * appeared above it, a card that grew because its contents changed. Those need
 * a measurement before the change and a measurement after, and that is all
 * this file is: measure, mutate, measure, and hand the difference to the Web
 * Animations API to play out.
 *
 * Every duration and curve here is read off the element being animated, so the
 * tokens in `tokens.css` remain the single place motion is tuned — including
 * the reduced-motion collapse, which these honour for free.
 */

/** Motion tokens as the stylesheet resolved them for this element. */
export interface Tempo {
	readonly fast: number;
	readonly base: number;
	readonly slow: number;
	readonly out: string;
	readonly settle: string;
	readonly spring: string;
	readonly arrive: string;
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
	return {
		fast: milliseconds(read("--bchc-duration-fast"), 160),
		base: milliseconds(read("--bchc-duration-base"), 320),
		slow: milliseconds(read("--bchc-duration-slow"), 560),
		out: read("--bchc-ease-out").trim() || "ease-out",
		settle: read("--bchc-ease-settle").trim() || "ease-out",
		spring: read("--bchc-ease-spring").trim() || "ease-out",
		arrive: read("--bchc-ease-arrive").trim() || "ease-out",
	};
}

/**
 * Wait for every animation under `root` to finish, however it finishes.
 *
 * A cancelled animation rejects its `finished` promise, and a modal that is
 * being torn down cancels plenty of them; none of that should stop the caller
 * from proceeding.
 */
export function settled(root: Element): Promise<void> {
	// A class toggled this same tick has not produced its animations yet: the
	// browser creates them at the next style pass. Reading layout forces that
	// pass, so what is collected below is what will actually play.
	void (root as HTMLElement).offsetHeight;
	const finite = root
		.getAnimations({ subtree: true })
		// A loop — a pulse, a sweep — never finishes, and waiting on it would
		// mean waiting forever.
		.filter(
			(animation) => animation.effect?.getTiming().iterations !== Infinity,
		);
	return Promise.allSettled(finite.map((animation) => animation.finished)).then(
		() => undefined,
	);
}

/**
 * Bring the modal's contents in a beat after the card, in reading order.
 *
 * Driven from script rather than a stylesheet rule on purpose: a rule matches
 * whatever is in the tree, so a body rebuilt during the entrance — a protocol
 * switched in the first second — would replay the arrival on its new rows.
 * These animations are attached to the elements present at first paint and to
 * nothing else.
 *
 * Only the card springs. The contents follow it damped, a beat apart, and
 * the heavier piece — the code's footer, under the tile — travels a little
 * further than the text, the way things of different mass would. One centre
 * of motion, and everything else in its wake.
 */
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

/**
 * Change an element's contents while animating its height from old to new.
 *
 * `height` is a layout property and animating it in CSS is rightly frowned on,
 * but here it runs exactly once per change, on one element, for a third of a
 * second, and the alternative — a card that snaps to a new size — is what
 * makes a modal feel like a web page. `overflow: clip` for the duration keeps
 * the incoming content from spilling out of a box that has not caught up.
 */
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

/** Where a list's rows were, keyed by identity, before it was re-templated. */
export interface RowSnapshot {
	readonly rect: DOMRect;
	readonly node: HTMLElement;
}

export function snapshotRows(
	container: HTMLElement,
	selector: string,
): Map<string, RowSnapshot> {
	const rows = new Map<string, RowSnapshot>();
	for (const node of container.querySelectorAll<HTMLElement>(selector)) {
		const id = node.getAttribute("data-id");
		if (id === null) continue;
		rows.set(id, { rect: node.getBoundingClientRect(), node });
	}
	return rows;
}

/**
 * Settle a re-templated list against where its rows used to be.
 *
 * Rows that were already listed slide from their old position to their new
 * one. Rows that just arrived fade in, in order, a beat apart. Rows that left
 * are put back as static ghosts exactly where they were and fade out, so
 * nothing simply vanishes. The list itself never re-lays-out for any of this:
 * every movement is a transform.
 */
export function flipRows(
	container: HTMLElement,
	selector: string,
	before: Map<string, RowSnapshot>,
): void {
	if (before.size === 0) return;
	const tempo = tempoOf(container);
	const seen = new Set<string>();
	let arrivals = 0;

	for (const node of container.querySelectorAll<HTMLElement>(selector)) {
		const id = node.getAttribute("data-id");
		if (id === null) continue;
		seen.add(id);
		const previous = before.get(id);

		if (previous === undefined) {
			node.animate(
				[
					{ opacity: 0, transform: "translateY(-6px) scale(0.98)" },
					{ opacity: 1, transform: "none" },
				],
				{
					duration: tempo.base,
					easing: tempo.out,
					delay: Math.min(arrivals * 40, 200) + tempo.fast / 2,
					fill: "backwards",
				},
			);
			arrivals += 1;
			continue;
		}

		const delta = previous.rect.top - node.getBoundingClientRect().top;
		if (Math.abs(delta) < 0.5) continue;
		node.animate(
			[{ transform: `translateY(${delta}px)` }, { transform: "none" }],
			{ duration: tempo.base, easing: tempo.settle },
		);
	}

	const origin = container.getBoundingClientRect();
	for (const [id, { rect, node }] of before) {
		if (seen.has(id)) continue;
		const ghost = node.cloneNode(true) as HTMLElement;
		ghost.setAttribute("aria-hidden", "true");
		ghost.inert = true;
		ghost.style.position = "absolute";
		ghost.style.top = `${rect.top - origin.top}px`;
		ghost.style.left = `${rect.left - origin.left}px`;
		ghost.style.width = `${rect.width}px`;
		ghost.style.pointerEvents = "none";
		container.append(ghost);
		ghost
			.animate(
				[
					{ opacity: 1, transform: "none" },
					{ opacity: 0, transform: "translateX(-8px)" },
				],
				{ duration: tempo.fast, easing: tempo.out, fill: "forwards" },
			)
			.finished.catch(() => undefined)
			.finally(() => ghost.remove());
	}
}

/**
 * Replace an element's contents with a directional crossfade.
 *
 * The outgoing content is left in place as a static layer that slides away
 * while the incoming content slides in from the opposite side. `direction` is
 * the way the visitor is travelling: forward into a sub-screen, back out of
 * one, or nowhere in particular for a change of state on the same screen,
 * which rises instead.
 */
export function crossfade(
	host: HTMLElement,
	mutate: () => void,
	direction: -1 | 0 | 1,
): void {
	const tempo = tempoOf(host);
	const outgoing = host.cloneNode(true) as HTMLElement;
	outgoing.classList.add("ghost");
	outgoing.setAttribute("aria-hidden", "true");
	outgoing.inert = true;
	// Pinned where the host was, so it takes no part in the new layout. The
	// stylesheet makes `.ghost` absolute; only the geometry is set here.
	outgoing.style.top = `${host.offsetTop}px`;
	outgoing.style.left = `${host.offsetLeft}px`;
	outgoing.style.width = `${host.offsetWidth}px`;

	mutate();

	host.parentElement?.insertBefore(outgoing, host);
	const away =
		direction === 0 ? "translateY(-6px)" : `translateX(${-14 * direction}px)`;
	const from =
		direction === 0 ? "translateY(8px)" : `translateX(${14 * direction}px)`;

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

/** Swap an element's text with a short fade, so a label never just flips. */
export function retext(element: HTMLElement, html: string): void {
	if (element.innerHTML === html) return;
	const tempo = tempoOf(element);
	const fade = element.animate([{ opacity: 1 }, { opacity: 0 }], {
		duration: tempo.fast / 2,
		easing: "linear",
		fill: "forwards",
	});
	fade.finished
		.catch(() => undefined)
		.finally(() => {
			element.innerHTML = html;
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
