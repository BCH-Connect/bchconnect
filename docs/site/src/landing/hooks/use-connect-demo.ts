import { useRef } from "react";

/**
 * No connector exists yet, so the hero button stays inert rather than
 * simulating a connection: real client and modal wiring lands once a real
 * connector (WizardConnect first) is ready.
 */
export function useConnectDemo() {
	const controlRef = useRef<HTMLButtonElement>(null);

	return {
		controlRef,
		preload: () => {},
	};
}
