import { isClientSnapshot } from "../snapshot.js";
import { createStore, type Store } from "../store.js";
import type {
	ClientConfig,
	ClientSnapshot,
	ClientState,
	ClientStore,
} from "../types/client.js";
import type { Connector, Logger } from "../types/protocol.js";

/**
 * State shared by the parts of one client. Never handed to dapps.
 *
 * @internal
 */
export interface ClientRuntime {
	/** Registered protocol ids, in registration order. */
	readonly protocols: readonly string[];
	/** The store behind the client. */
	readonly store: Store<ClientState>;
	/** The view of {@link ClientRuntime.store} that dapps get, without `setState`. */
	readonly publicStore: ClientStore;
}

function noop() {}
const silentLogger: Logger = {
	debug: noop,
	info: noop,
	warn: noop,
	error: noop,
};

function seedSnapshot(
	initialState: ClientSnapshot | undefined,
	logger: Logger,
): ClientSnapshot | null {
	if (initialState === undefined) return null;
	if (isClientSnapshot(initialState)) return initialState;

	logger.debug("Discarding malformed initial state", initialState);
	return null;
}

/**
 * Creates the {@link ClientRuntime} for an already validated config. Performs
 * no I/O.
 *
 * Under `ssr`, the state starts `"restoring"` and holds `initialState` as its
 * snapshot; an `initialState` that is not a well-formed snapshot is discarded
 * with a `debug` log.
 *
 * @example
 * ```ts
 * const runtime = createClientRuntime(config);
 * runtime.store.getState().status; // "idle"
 * ```
 *
 * @internal
 */
export function createClientRuntime(
	config: ClientConfig<readonly Connector[]>,
): ClientRuntime {
	const logger = config.logger ?? silentLogger;
	const ssr = config.ssr === true;
	const store = createStore<ClientState>({
		status: ssr ? "restoring" : "idle",
		sessions: new Map(),
		currentSessionId: null,
		pendingRequests: new Map(),
		snapshot: ssr ? seedSnapshot(config.initialState, logger) : null,
	});

	// The store's methods are closures, so they work detached from it.
	const { getState, subscribe } = store;

	return {
		protocols: config.connectors.map((connector) => connector.protocol),
		store,
		publicStore: { getState, subscribe },
	};
}
