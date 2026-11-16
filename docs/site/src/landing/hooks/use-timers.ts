import { useCallback, useEffect, useRef } from "react";

/** Timeouts that are all cleared together, and on unmount. */
export function useTimers() {
	const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

	const later = useCallback((ms: number, run: () => void) => {
		const timer = setTimeout(() => {
			timers.current.delete(timer);
			run();
		}, ms);
		timers.current.add(timer);
	}, []);

	const clear = useCallback(() => {
		for (const timer of timers.current) clearTimeout(timer);
		timers.current.clear();
	}, []);

	useEffect(() => clear, [clear]);

	return { later, clear };
}
