import type { Ref } from "react";
import { CONNECT } from "../content";

interface ConnectControlProps {
	readonly ref: Ref<HTMLButtonElement>;
	readonly onPreload: () => void;
}

/**
 * No connector exists yet, so this stays a disabled preview of the real
 * button rather than simulating a connection.
 */
export function ConnectControl({ ref, onPreload }: ConnectControlProps) {
	return (
		<div className="connect">
			<button
				ref={ref}
				type="button"
				className="connect-button"
				data-wire="start"
				disabled
				title={CONNECT.disabledHint}
				onPointerEnter={onPreload}
				onFocus={onPreload}
			>
				<span className="connect-button-live" aria-hidden="true" />
				{CONNECT.action}
			</button>
		</div>
	);
}
