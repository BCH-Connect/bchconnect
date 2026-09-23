/**
 * The connection code.
 *
 * Drawn with `qr-code-styling`, which ships a UMD build and no ES module entry,
 * so the constructor is passed in rather than imported. That keeps this file
 * free of any reach for a global and leaves the production path — a bundler
 * resolving a plain import — a one-line change.
 *
 * The protocol's mark is *buried* in the code: modules are knocked out around
 * it so it sits in the grid rather than on a plate laid over the top. Error
 * correction is at level H specifically to pay for that hole.
 *
 * ## The well
 *
 * A mark with transparent edges — a hat, a disc — floats loose in that hole.
 * Those are set on a faint accent plate first, composed into one SVG that the
 * library then treats as the mark. The plate is the dapp's accent at a tenth of
 * its strength: enough to place the glyph, not enough to fight it.
 *
 * ## Redraws
 *
 * `update()` tears the SVG down and draws a new one, which is a hard cut at the
 * exact moment the user is looking at the code. So a redraw keeps the old
 * drawing on screen as a ghost while the new one writes itself in over it.
 */

import type { ProtocolMark } from "./state.ts";

/** The shape of `qr-code-styling`'s default export that this file relies on. */
export interface CodeRenderer {
	new (options: CodeOptions): CodeInstance;
}

interface CodeInstance {
	append(container: HTMLElement): void;
	update(options: Partial<CodeOptions>): void;
}

interface CodeOptions {
	width: number;
	height: number;
	type: "canvas" | "svg";
	data: string;
	image?: string | undefined;
	margin: number;
	qrOptions: { errorCorrectionLevel: "L" | "M" | "Q" | "H" };
	imageOptions: {
		hideBackgroundDots: boolean;
		imageSize: number;
		margin: number;
		crossOrigin: string;
	};
	dotsOptions: { color: string; type: "dots"; roundSize: boolean };
	cornersSquareOptions: { color: string; type: "extra-rounded" };
	cornersDotOptions: { color: string; type: "dot" };
	backgroundOptions: { color: string };
}

export interface CodeRequest {
	readonly link: string;
	readonly mark: ProtocolMark | null;
	/**
	 * Resolved colours, not token names.
	 *
	 * Reading `--bchc-text` off a computed style hands back the token's *text* —
	 * `light-dark(a, b)` — because custom properties are not resolved past
	 * substitution. Handing that to the renderer produced a code drawn in a
	 * colour no canvas or SVG could parse. These must be used values, taken from
	 * an element that actually renders them.
	 */
	readonly foreground: string;
	readonly background: string;
	/** The accent, resolved the same way. Only the well uses it. */
	readonly accent: string;
	/**
	 * A stand-in while the real link is still on its way. Drawn exactly like a
	 * code, then shown faint under a passing light, so the shape of what is
	 * coming is already there when it arrives.
	 */
	readonly placeholder?: boolean;
}

/**
 * The tile is square and fluid, so the code is drawn once at a fixed large
 * size and scaled by CSS, which stays sharp on any display. The module grid is
 * not snapped to whole pixels at this size — see `dotsOptions` below.
 */
const SIZE = 512;

/**
 * How much of the code a mark may cover.
 *
 * A tile fills its box, so at 0.18 it reads as sitting in the grid. A glyph is
 * drawn inside a plate that is larger than the glyph itself, so its box is a
 * little bigger to keep the glyph the same visual size as a tile would be.
 */
const MARK_SIZE = { tile: 0.18, glyph: 0.21 } as const;

/** Inset of the glyph within its plate, as a fraction of the plate. */
const WELL_INSET = 0.15;

/** The plate's corner radius, as a fraction of the plate. */
const WELL_RADIUS = 0.24;

/** The plate's opacity over the code's paper. */
const WELL_OPACITY = 0.1;

/**
 * Clear paper between the mark and the nearest module, in pixels of the drawn
 * code. About one module: enough that the plate reads as set into the grid
 * rather than jammed against it, not so much that the hole grows into a plate
 * of its own.
 */
const MARK_MARGIN = 12;

interface Drawn {
	readonly instance: CodeInstance;
	/** Everything the drawn code depends on, so an unchanged code is left alone. */
	readonly key: string;
}

const instances = new WeakMap<HTMLElement, Drawn>();

/** The latest request per container, so a slow fetch cannot overwrite a newer draw. */
const latest = new WeakMap<HTMLElement, string>();

const dataUris = new Map<string, Promise<string>>();

/**
 * The mark as a data URI, fetched once per source.
 *
 * Needed because the plate is composed as an SVG that has to embed the glyph:
 * an SVG used as an image cannot load external resources of its own.
 */
function asDataUri(src: string): Promise<string> {
	let pending = dataUris.get(src);
	if (pending === undefined) {
		pending = fetch(src)
			.then((response) => response.blob())
			.then(
				(blob) =>
					new Promise<string>((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => resolve(String(reader.result));
						reader.onerror = () => reject(reader.error);
						reader.readAsDataURL(blob);
					}),
			);
		pending.catch(() => dataUris.delete(src));
		dataUris.set(src, pending);
	}
	return pending;
}

/** A glyph on its plate, as one image the library can bury. */
function well(glyph: string, accent: string): string {
	const inset = WELL_INSET * 100;
	const size = 100 - inset * 2;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${WELL_RADIUS * 100}" fill="${accent}" fill-opacity="${WELL_OPACITY}"/><image href="${glyph}" x="${inset}" y="${inset}" width="${size}" height="${size}"/></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

async function markImage(
	mark: ProtocolMark | null,
	accent: string,
): Promise<string | undefined> {
	if (mark === null) return undefined;
	if (mark.shape === "tile") return mark.src;
	return well(await asDataUri(mark.src), accent);
}

/** The drawing the library owns, as opposed to a ghost of an earlier one. */
function drawing(container: HTMLElement): SVGElement | null {
	const current = container.querySelector(":scope > svg:not(.code-ghost)");
	return current instanceof SVGElement ? current : null;
}

/**
 * Leave an earlier drawing behind as a ghost the new one writes over.
 *
 * Appended *after* the library has drawn, because `update()` empties the
 * container before it appends — anything left there beforehand is gone. The
 * ghost is a static clone with no behaviour; the stylesheet dissolves it and
 * it removes itself once that ends.
 */
function ghost(container: HTMLElement, previous: SVGElement): void {
	for (const stale of container.querySelectorAll(".code-ghost")) stale.remove();
	previous.classList.remove("is-fresh");
	previous.classList.add("code-ghost");
	previous.setAttribute("aria-hidden", "true");
	previous.addEventListener("animationend", () => previous.remove(), {
		once: true,
	});
	container.append(previous);
}

/**
 * Mark the drawing as newly made so it writes itself in.
 *
 * A class rather than a bare rule on the element: a CSS animation restarts
 * whenever its element is re-attached to the document, and the code host is
 * moved between parents every time the body is rebuilt. The class is dropped
 * once the write has played, so a code that merely changed places stays put.
 */
function fresh(container: HTMLElement, placeholder: boolean): void {
	const current = drawing(container);
	if (current === null) return;
	current.classList.add("is-fresh");
	current.classList.toggle("is-placeholder", placeholder);
	const done = (event: AnimationEvent): void => {
		if (event.target !== current) return;
		current.classList.remove("is-fresh");
		current.removeEventListener("animationend", done);
		current.removeEventListener("animationcancel", done);
	};
	current.addEventListener("animationend", done);
	// Detaching the drawing mid-write cancels the animation without ending
	// it; the class still has to go, or the write replays on re-attach.
	current.addEventListener("animationcancel", done);
}

export async function renderCode(
	Renderer: CodeRenderer,
	container: HTMLElement,
	request: CodeRequest,
): Promise<void> {
	const { foreground, background, accent, mark } = request;
	const placeholder = request.placeholder === true;
	const key = `${request.link}|${mark?.src ?? ""}|${mark?.shape ?? ""}|${foreground}|${background}|${accent}|${placeholder}`;
	if (instances.get(container)?.key === key) return;
	latest.set(container, key);

	const image = await markImage(mark, accent);
	// Something newer was asked for while the mark was loading.
	if (latest.get(container) !== key) return;

	const options: CodeOptions = {
		width: SIZE,
		height: SIZE,
		type: "svg",
		data: request.link,
		image,
		margin: 0,
		// Level H tolerates roughly 30% loss, which is what buys the hole the
		// mark sits in.
		qrOptions: { errorCorrectionLevel: "H" },
		// A tight well, not a plate. At 0.32 the mark punched a hole big enough
		// to read as something laid on top of the code; well under that keeps
		// it sitting in the grid, which is what the accepted prototype does.
		imageOptions: {
			hideBackgroundDots: true,
			imageSize: MARK_SIZE[mark?.shape ?? "tile"],
			margin: MARK_MARGIN,
			crossOrigin: "anonymous",
		},
		// Not snapped to whole pixels. Snapping leaves a margin that depends on
		// how many modules the payload needs, so a stand-in and the real link
		// drew at different sizes and the code appeared to grow on arrival. The
		// drawing is scaled by the tile anyway, so snapping bought no crispness.
		dotsOptions: { color: foreground, type: "dots", roundSize: false },
		// The finders are the same ink as the modules. Accenting them picks out
		// the three corners as if they meant something, when they are just part
		// of the code — and it leaves the eye reading a pattern instead of a
		// single scannable object.
		cornersSquareOptions: { color: foreground, type: "extra-rounded" },
		cornersDotOptions: { color: foreground, type: "dot" },
		backgroundOptions: { color: background },
	};

	const existing = instances.get(container);
	if (existing !== undefined) {
		const previous = drawing(container)?.cloneNode(true);
		existing.instance.update(options);
		fresh(container, placeholder);
		if (previous instanceof SVGElement) ghost(container, previous);
		instances.set(container, { instance: existing.instance, key });
		return;
	}

	const instance = new Renderer(options);
	container.replaceChildren();
	instance.append(container);
	fresh(container, placeholder);
	instances.set(container, { instance, key });
}
