import { ConfigError } from "../errors.js";
import { connectorPrefix, namespaced } from "../storage/namespace.js";
import type { ConnectorEventName, LifecycleEvents } from "../types/client.js";
import type { ConnectorContext } from "../types/protocol.js";
import type { ClientRuntime } from "./runtime.js";

/**
 * Receives the session lifecycle events a connector emits through its
 * context, tagged with the connector's protocol id.
 *
 * @internal
 */
export type ConnectorEventHandler = <E extends ConnectorEventName>(
	protocol: string,
	event: E,
	payload: LifecycleEvents[E],
) => void;

/**
 * The client's lifecycle operations.
 *
 * @internal
 */
export interface Lifecycle {
	/**
	 * Sets up every connector, in registration order, then marks the client
	 * ready. Every call returns the promise of the first.
	 */
	init(): Promise<void>;
}

/**
 * Creates the {@link Lifecycle} of one client. Connector events are handed to
 * `onConnectorEvent`.
 *
 * A connector whose `setup()` throws is reported through `client:error` and
 * never stops the others from being set up.
 *
 * @example
 * ```ts
 * const lifecycle = createLifecycle(runtime, sessions.onConnectorEvent);
 * await lifecycle.init();
 * ```
 *
 * @internal
 */
export function createLifecycle(
	runtime: ClientRuntime,
	onConnectorEvent: ConnectorEventHandler,
): Lifecycle {
	const { store } = runtime;
	let initialization: Promise<void> | undefined;

	function contextFor(protocol: string) {
		return {
			storage: namespaced(runtime.connectorStorage, connectorPrefix(protocol)),
			network: runtime.network,
			appMetadata: runtime.appMetadata,
			logger: runtime.logger,
			emit(event, payload) {
				onConnectorEvent(protocol, event, payload);
			},
		} satisfies ConnectorContext;
	}

	async function initialize() {
		store.setState((state) =>
			state.status === "idle" ? { ...state, status: "restoring" } : state,
		);

		for (const [protocol, connector] of runtime.connectors) {
			try {
				await connector.setup?.(contextFor(protocol));
			} catch (error) {
				runtime.reportError(
					error,
					(cause) =>
						new ConfigError(`Connector "${protocol}" failed setup`, { cause }),
				);
			}
		}

		store.setState((state) => ({ ...state, status: "ready" }));
	}

	return {
		init() {
			if (initialization === undefined) {
				// Stored before `initialize` runs: its first `setState` notifies
				// subscribers synchronously, and one of them may call `init()` again.
				let start = () => {};
				initialization = new Promise<void>((resolve) => {
					start = () => resolve(initialize());
				});
				start();
			}
			return initialization;
		},
	};
}
