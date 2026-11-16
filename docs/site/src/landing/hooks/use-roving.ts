import type { KeyboardEvent } from "react";
import { useRef } from "react";

/**
 * Keyboard behaviour for a single-select row: one tab stop, and arrow keys,
 * Home and End move the selection, as the tabs and radio group patterns both
 * specify.
 */
export function useRoving<Id extends string>(
	ids: readonly Id[],
	value: Id,
	onChange: (id: Id) => void,
) {
	const nodes = useRef(new Map<Id, HTMLButtonElement>());

	function onKeyDown(event: KeyboardEvent) {
		const current = ids.indexOf(value);
		const moves: Readonly<Record<string, number>> = {
			ArrowRight: current + 1,
			ArrowDown: current + 1,
			ArrowLeft: current - 1,
			ArrowUp: current - 1,
			Home: 0,
			End: ids.length - 1,
		};
		const target = moves[event.key];
		if (target === undefined) return;
		event.preventDefault();
		const id = ids[(target + ids.length) % ids.length];
		if (id === undefined) return;
		onChange(id);
		nodes.current.get(id)?.focus();
	}

	function item(id: Id) {
		return {
			ref: (node: HTMLButtonElement | null) => {
				if (node === null) nodes.current.delete(id);
				else nodes.current.set(id, node);
			},
			type: "button",
			tabIndex: id === value ? 0 : -1,
			onClick: () => onChange(id),
		} as const;
	}

	return { onKeyDown, item };
}
