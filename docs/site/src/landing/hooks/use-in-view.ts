import type { RefObject } from "react";
import { useEffect, useState } from "react";

/** Whether the element is on screen, so demos only run while someone can see them. */
export function useInView(
	ref: RefObject<Element | null>,
	rootMargin = "0px",
): boolean {
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (element === null) return;
		const observer = new IntersectionObserver(
			([entry]) => setInView(entry?.isIntersecting ?? false),
			{ rootMargin },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref, rootMargin]);

	return inView;
}

/** Read once per effect: the demos hold still for people who ask for less motion. */
export function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
