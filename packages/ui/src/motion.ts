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
		enter: read("--bchc-ease-enter").trim() || "ease-out",
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

// FLIP: moved rows slide to their new position, new rows fade in staggered,
// removed rows are replaced by static copies that fade out in place.
export function flipRows(
	container: HTMLElement,
	selector: string,
	before: Map<string, RowSnapshot>,
): void {
	if (before.size === 0) return;
	const tempo = tempoOf(container);
	const seen = new Set<string>();
	let entering = 0;

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
					delay: Math.min(entering * 40, 200) + tempo.fast / 2,
					fill: "backwards",
				},
			);
			entering += 1;
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
		const outgoingRow = node.cloneNode(true) as HTMLElement;
		outgoingRow.setAttribute("aria-hidden", "true");
		outgoingRow.inert = true;
		outgoingRow.style.position = "absolute";
		outgoingRow.style.top = `${rect.top - origin.top}px`;
		outgoingRow.style.left = `${rect.left - origin.left}px`;
		outgoingRow.style.width = `${rect.width}px`;
		outgoingRow.style.pointerEvents = "none";
		container.append(outgoingRow);
		outgoingRow
			.animate(
				[
					{ opacity: 1, transform: "none" },
					{ opacity: 0, transform: "translateX(-8px)" },
				],
				{ duration: tempo.fast, easing: tempo.out, fill: "forwards" },
			)
			.finished.catch(() => undefined)
			.finally(() => outgoingRow.remove());
	}
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

// Tracked separately: a browser re-serialises `innerHTML`, so it never reads back equal to what was set.
const lastRetext = new WeakMap<Element, string>();

/** Swap an element's text with a short fade, so a label never just flips. */
export function retext(element: HTMLElement, html: string): void {
	if (lastRetext.get(element) === html) return;
	lastRetext.set(element, html);
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
