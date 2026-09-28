// qr-code-styling is a UMD build; its constructor is injected by register.ts.
// update() can't cross-fade, so a redraw keeps the outgoing drawing in place
// while the new one writes over it (keepOutgoing/playWriteIn).

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
	// Resolved colours, not token names: a custom property can read back as
	// `light-dark(a, b)` text, which no canvas or SVG can parse.
	readonly foreground: string;
	readonly background: string;
	readonly accent: string;
	/** Whether this draws a placeholder shown faint with a light sweep, while the real link is on its way. */
	readonly placeholder?: boolean;
}

/** Drawn once at a fixed size and scaled by CSS. */
const SIZE = 512;

/** How much of the code a mark may cover; a glyph's box is bigger to match a tile's visual size. */
const MARK_SIZE = { tile: 0.18, glyph: 0.21 } as const;

// Fractions of the plate itself, not the whole code.
const PLATE_INSET = 0.15;
const PLATE_RADIUS = 0.24;
const PLATE_OPACITY = 0.1;

/** Gap between the mark and the nearest module, in pixels of the drawn code. */
const MARK_MARGIN = 12;

interface RenderedCode {
	readonly instance: CodeInstance;
	readonly key: string;
}

const rendered = new WeakMap<HTMLElement, RenderedCode>();
/** The latest request per container, so a slow fetch cannot overwrite a newer draw. */
const latestKey = new WeakMap<HTMLElement, string>();
const dataUris = new Map<string, Promise<string>>();

async function fetchDataUri(src: string): Promise<string> {
	const response = await fetch(src);
	if (!response.ok) throw new Error(`Mark request failed: ${response.status}`);
	const blob = await response.blob();
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

// Cached per source: an SVG used as an image can't load its own external
// resources. Synchronous so concurrent callers share the in-flight request.
function asDataUri(src: string): Promise<string> {
	let pending = dataUris.get(src);
	if (pending === undefined) {
		pending = fetchDataUri(src);
		pending.catch(() => dataUris.delete(src));
		dataUris.set(src, pending);
	}
	return pending;
}

function plate(glyph: string, accent: string): string {
	const inset = PLATE_INSET * 100;
	const size = 100 - inset * 2;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${PLATE_RADIUS * 100}" fill="${accent}" fill-opacity="${PLATE_OPACITY}"/><image href="${glyph}" x="${inset}" y="${inset}" width="${size}" height="${size}"/></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

async function markImage(
	mark: ProtocolMark | null,
	accent: string,
): Promise<string | undefined> {
	if (mark === null) return undefined;
	if (mark.shape === "tile") return mark.src;
	try {
		return plate(await asDataUri(mark.src), accent);
	} catch {
		// A failed fetch draws the code without its mark rather than not at all.
		return undefined;
	}
}

function currentDrawing(container: HTMLElement): SVGElement | null {
	const current = container.querySelector(":scope > svg:not(.code-outgoing)");
	return current instanceof SVGElement ? current : null;
}

// Appended after update() empties the container; a static clone the
// stylesheet dissolves, removing itself once that finishes.
function keepOutgoing(container: HTMLElement, previous: SVGElement): void {
	for (const stale of container.querySelectorAll(".code-outgoing"))
		stale.remove();
	previous.classList.remove("is-writing");
	previous.classList.add("code-outgoing");
	previous.setAttribute("aria-hidden", "true");
	previous.addEventListener("animationend", () => previous.remove(), {
		once: true,
	});
	container.append(previous);
}

// A class, not a bare rule: re-attaching an element restarts a CSS
// animation, and the code host moves parents on every rebuild.
function playWriteIn(container: HTMLElement, placeholder: boolean): void {
	const current = currentDrawing(container);
	if (current === null) return;
	current.classList.add("is-writing");
	current.classList.toggle("is-placeholder", placeholder);
	const done = (event: AnimationEvent): void => {
		if (event.target !== current) return;
		current.classList.remove("is-writing");
		current.removeEventListener("animationend", done);
		current.removeEventListener("animationcancel", done);
	};
	current.addEventListener("animationend", done);
	// animationcancel too: a mid-write detach cancels without ending, but the class still must go.
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
	if (rendered.get(container)?.key === key) return;
	// Same request already in flight for this container: let it finish.
	if (latestKey.get(container) === key) return;
	latestKey.set(container, key);

	const image = await markImage(mark, accent);
	// Something newer was asked for while the mark was loading.
	if (latestKey.get(container) !== key) return;

	const options: CodeOptions = {
		width: SIZE,
		height: SIZE,
		type: "svg",
		data: request.link,
		image,
		margin: 0,
		// Level H (~30% loss tolerance) is what buys the hole the mark sits in.
		qrOptions: { errorCorrectionLevel: "H" },
		imageOptions: {
			hideBackgroundDots: true,
			imageSize: MARK_SIZE[mark?.shape ?? "tile"],
			margin: MARK_MARGIN,
			crossOrigin: "anonymous",
		},
		// roundSize:false: snapping ties margin to module count, so the placeholder
		// and the real link would otherwise draw at different sizes.
		dotsOptions: { color: foreground, type: "dots", roundSize: false },
		// Finder patterns use the foreground colour, not the accent.
		cornersSquareOptions: { color: foreground, type: "extra-rounded" },
		cornersDotOptions: { color: foreground, type: "dot" },
		backgroundOptions: { color: background },
	};

	const existing = rendered.get(container);
	if (existing !== undefined) {
		const previous = currentDrawing(container)?.cloneNode(true);
		existing.instance.update(options);
		playWriteIn(container, placeholder);
		if (previous instanceof SVGElement) keepOutgoing(container, previous);
		rendered.set(container, { instance: existing.instance, key });
		return;
	}

	const instance = new Renderer(options);
	container.replaceChildren();
	instance.append(container);
	playWriteIn(container, placeholder);
	rendered.set(container, { instance, key });
}
