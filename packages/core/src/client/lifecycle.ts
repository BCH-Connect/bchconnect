import { ConfigError, TransportError } from "../errors.js";
import { withTimeout } from "../internal/abort.js";
import { parseSnapshot, SNAPSHOT_KEY } from "../snapshot.js";
import { connectorPrefix, namespaced } from "../storage/namespace.js";
import type {
	ClientSnapshot,
	ConnectorEventName,
	LifecycleEvents,
} from "../types/client.js";
import type { ConnectorContext, Session } from "../types/protocol.js";
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
	 * Sets up every connector, in registration order, restores the sessions of
	 * every connector whose setup succeeded, and marks the client ready. Every
	 * call returns the promise of the first.
	 */
	init(): Promise<void>;
}

// The session the snapshot marked current when it was restored, else the
// first restored session.
function selectCurrent(
	sessions: ReadonlyMap<string, Session>,
	reference: ClientSnapshot | undefined,
) {
	const preferred = reference?.currentSessionId ?? null;
	if (preferred !== null && sessions.has(preferred)) return preferred;

	return sessions.keys().next().value ?? null;
}

/**
 * Creates the {@link Lifecycle} of one client. Connector events are handed to
 * `onConnectorEvent`.
 *
 * A connector whose `setup()` throws is reported through `client:error`,
 * never stops the others from being set up, and is not restored. A failing
 * `restore()`, or one that outlasts the read timeout, is reported the same way
 * and never stops the others. Reading the client snapshot is bounded by the
 * same timeout; a failed read counts as no snapshot.
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
				runtime.disabled.set(protocol, error);
				runtime.reportError(
					error,
					(cause) =>
						new ConfigError(`Connector "${protocol}" failed setup`, { cause }),
				);
			}
		}

		const [reference, sessions] = await Promise.all([
			readSnapshot(),
			restoreAll(),
		]);

		store.setState((state) => ({
			...state,
			status: "ready",
			sessions,
			currentSessionId: selectCurrent(sessions, reference),
		}));
	}

	// The snapshot the previous page load left: the ssr seed, else the one in
	// client-tier storage.
	async function readSnapshot() {
		const { snapshot } = store.getState();
		if (snapshot !== null) return snapshot;

		try {
			const raw = await withTimeout(
				() => runtime.clientStorage.get(SNAPSHOT_KEY),
				{
					timeoutMs: runtime.readTimeoutMs,
					timeoutMessage: "Reading the client snapshot timed out",
				},
			);
			return parseSnapshot(raw, runtime.logger);
		} catch (error) {
			runtime.reportError(
				error,
				(cause) =>
					new TransportError("Reading the client snapshot failed", { cause }),
			);
			return undefined;
		}
	}

	async function restoreAll() {
		const restored = await Promise.all(
			[...runtime.connectors]
				.filter(([protocol]) => !runtime.disabled.has(protocol))
				.map(async ([protocol, connector]) => {
					try {
						// `restore()` takes no signal, so a late result is dropped, not
						// cancelled.
						return await withTimeout(() => connector.restore(), {
							timeoutMs: runtime.readTimeoutMs,
							timeoutMessage: `restore() timed out for connector "${protocol}"`,
						});
					} catch (error) {
						runtime.reportError(
							error,
							(cause) =>
								new TransportError(
									`restore() failed for connector "${protocol}"`,
									{ cause },
								),
						);
						return [];
					}
				}),
		);

		return new Map(restored.flat().map((session) => [session.id, session]));
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
