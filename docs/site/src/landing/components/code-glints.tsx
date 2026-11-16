import { useEffect, useRef, useState } from "react";
import { useInView } from "../hooks/use-in-view";

type Module = readonly [x: number, y: number];

const FIELD_URL = "/landing/code-field.svg";
const FIELD_CENTRE = 16.5;
/* Past this radius the field's own fade hides a glint, so none start there. */
const VISIBLE_RADIUS = 13;
const MAX_LIT = 7;
const SPAWN_EVERY_MS = 900;

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

async function loadModules(): Promise<Module[]> {
	const text = await (await fetch(FIELD_URL)).text();
	const modules: Module[] = [];
	for (const match of text.matchAll(/cx="([\d.]+)" cy="([\d.]+)"/g)) {
		const x = Number(match[1]);
		const y = Number(match[2]);
		if (Math.hypot(x - FIELD_CENTRE, y - FIELD_CENTRE) < VISIBLE_RADIUS) {
			modules.push([x, y]);
		}
	}
	return modules;
}

/*
 * A few modules of the connection code brighten and fade, slowly and at
 * random, over the field drawn by `.hero-demo::before`. The loop idles while
 * the tab is hidden.
 */
export function CodeGlints() {
	const layerRef = useRef<SVGSVGElement>(null);
	const [modules, setModules] = useState<Module[]>([]);
	const inView = useInView(layerRef);

	useEffect(() => {
		let cancelled = false;
		loadModules()
			.then((loaded) => {
				if (!cancelled) setModules(loaded);
			})
			.catch(() => {
				// Without the field there is nothing to light; the layer stays empty.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const layer = layerRef.current;
		if (!layer || modules.length === 0 || !inView) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const dots = Array.from(layer.children) as SVGCircleElement[];
		const lit = new Set<SVGCircleElement>();

		const spawn = () => {
			if (document.hidden) return;
			if (lit.size >= MAX_LIT) return;
			const dot = dots[Math.floor(Math.random() * dots.length)];
			if (!dot || lit.has(dot)) return;
			lit.add(dot);
			const peak = randomBetween(0.45, 1);
			const animation = dot.animate(
				[
					{ opacity: 0 },
					{ opacity: peak, offset: randomBetween(0.4, 0.6) },
					{ opacity: 0 },
				],
				{
					duration: randomBetween(5200, 8400),
					easing: "cubic-bezier(0.37, 0, 0.63, 1)",
				},
			);
			animation.onfinish = () => lit.delete(dot);
		};

		let timer = 0;
		const tick = () => {
			spawn();
			timer = window.setTimeout(tick, randomBetween(0.5, 1.5) * SPAWN_EVERY_MS);
		};
		tick();
		return () => {
			window.clearTimeout(timer);
			for (const animation of layer.getAnimations({ subtree: true })) {
				animation.cancel();
			}
		};
	}, [modules, inView]);

	return (
		<svg
			ref={layerRef}
			className="code-glints"
			viewBox="0 0 33 33"
			aria-hidden="true"
			focusable="false"
		>
			{modules.map(([x, y]) => (
				<circle key={`${x},${y}`} cx={x} cy={y} r="0.33" />
			))}
		</svg>
	);
}
