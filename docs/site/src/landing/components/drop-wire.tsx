import type { CSSProperties } from "react";
import { useLayoutEffect, useRef, useState } from "react";

interface Span {
	readonly x: number;
	readonly top: number;
	readonly height: number;
}

interface Box {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

/**
 * An element's layout box in the root's coordinates. Offsets ignore
 * transforms, so the boxes' scroll reveal and the button's press never
 * bend the measurement.
 */
function layoutBox(element: HTMLElement, root: HTMLElement): Box {
	let left = 0;
	let top = 0;
	let node: HTMLElement | null = element;
	while (node !== null && node !== root) {
		left += node.offsetLeft;
		top += node.offsetTop;
		node = node.offsetParent as HTMLElement | null;
	}
	return {
		left,
		top,
		right: left + element.offsetWidth,
		bottom: top + element.offsetHeight,
	};
}

interface DropWireProps {
	readonly connected: boolean;
}

/** Minimum distance from the wire to either side of the end box, or the wire is not drawn. */
const END_INSET = 40;

/**
 * A wire from the element marked `data-wire="start"` down to the one marked
 * `data-wire="end"`, both inside the wire's parent. It is drawn only while
 * the end sits below the start, and marks the end with `data-port` and
 * `--port-x` where the wire meets it.
 */
export function DropWire({ connected }: DropWireProps) {
	// Always rendered, so the wire can find the landing root, its parent, before it draws.
	const anchorRef = useRef<HTMLSpanElement>(null);
	const [span, setSpan] = useState<Span | null>(null);

	// Re-measured on connect: the account replaces the button and sits at another height.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `connected` only triggers a new measurement.
	useLayoutEffect(() => {
		const root = anchorRef.current?.parentElement;
		if (root === null || root === undefined) return;
		const measure = () => {
			const control = root.querySelector<HTMLElement>('[data-wire="start"]');
			const port = root.querySelector<HTMLElement>('[data-wire="end"]');
			if (control === null || port === null) return setSpan(null);
			const from = layoutBox(control, root);
			const to = layoutBox(port, root);
			const x = (from.left + from.right) / 2;
			const fits = x > to.left + END_INSET && x < to.right - END_INSET;
			if (!fits || to.top <= from.bottom) {
				port.removeAttribute("data-port");
				return setSpan(null);
			}
			port.style.setProperty("--port-x", `${x - to.left}px`);
			port.setAttribute("data-port", "");
			setSpan({ x, top: from.bottom, height: to.top - from.bottom });
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		for (const node of root.querySelectorAll("[data-wire]")) {
			observer.observe(node);
		}
		return () => observer.disconnect();
	}, [connected]);

	if (span === null) return <span ref={anchorRef} hidden />;

	return (
		<>
			<span ref={anchorRef} hidden />
			<svg
				className="drop"
				data-connected={connected}
				width="12"
				height={span.height}
				viewBox={`0 0 12 ${span.height}`}
				aria-hidden="true"
				style={
					{
						left: span.x - 6,
						top: span.top,
						"--drop-length": span.height,
					} as CSSProperties
				}
			>
				<path d={`M6 0 V${span.height}`} className="drop-edge" />
				<path d={`M6 0 V${span.height}`} className="drop-line" />
				<path d={`M6 0 V${span.height}`} pathLength={1} className="drop-lit" />
				<path
					d={`M6 0 V${span.height}`}
					pathLength={1}
					className="drop-signal"
				/>
			</svg>
		</>
	);
}
