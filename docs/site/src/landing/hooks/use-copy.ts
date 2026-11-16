import { useCallback, useEffect, useRef, useState } from "react";

/** How long a control shows its copied state. */
const FEEDBACK_MS = 2000;

/** Copies text to the clipboard and reports `copied` for a moment afterwards. */
export function useCopy() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) clearTimeout(timer.current);
		},
		[],
	);

	const copy = useCallback(async (text: string) => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		if (timer.current !== null) clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
	}, []);

	return { copied, copy };
}
