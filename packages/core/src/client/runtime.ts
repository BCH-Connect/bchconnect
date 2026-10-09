import { type BchConnectError, isBchConnectError } from "../errors.js";
import { isClientSnapshot } from "../snapshot.js";
import { memory } from "../storage/memory.js";
import { createStore, type Store } from "../store.js";
import type {
	ClientConfig,
	ClientSnapshot,
	ClientState,
	ClientStore,
} from "../types/client.js";
import type {
	AppMetadata,
	Connector,
	KeyValueStore,
	Logger,
	Network,
} from "../types/protocol.js";
import { createEmitter, type LifecycleEmitter } from "./events.js";

/**
 * State shared by the parts of one client. Never handed to dapps.
 *
 * @internal
 */
export interface ClientRuntime {
	/** Registered protocol ids, in registration order. */
	readonly protocols: readonly string[];
	/** Connectors by protocol id, in registration order. */
	readonly connectors: ReadonlyMap<string, Connector>;
	/** The dapp's network. */
	readonly network: Network;
	/** The dapp's identity. */
	readonly appMetadata: AppMetadata;
	/** The configured logger, or one that discards everything. */
	readonly logger: Logger;
	/** Deadline for a machine round trip, such as a connector's `restore()`. */
	readonly readTimeoutMs: number;
	/** Default deadline for `connect()`, if the dapp set one. */
	readonly connectTimeoutMs: number | undefined;
	/** Where the client snapshot is persisted: the configured storage, else memory. */
	readonly clientStorage: KeyValueStore;
	/** Storage the connector namespaces live in. Never the client tier. */
	readonly connectorStorage: KeyValueStore;
	/**
	 * Protocols whose connector failed setup, with the error it threw. They
	 * stay registered but unusable.
	 */
	readonly disabled: Map<string, unknown>;
	/** The store behind the client. */
	readonly store: Store<ClientState>;
	/** The view of {@link ClientRuntime.store} that dapps get, without `setState`. */
	readonly publicStore: ClientStore;
	/** The client's lifecycle events. */
	readonly events: LifecycleEmitter;
	/**
	 * Emits `client:error` for a failure no caller can receive. A
	 * {@link BchConnectError} passes through; anything else is wrapped by `wrap`.
	 */
	reportError(error: unknown, wrap: (cause: unknown) => BchConnectError): void;
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
	const store = createStore<ClientState>(
		{
			status: ssr ? "restoring" : "idle",
			sessions: new Map(),
			currentSessionId: null,
			pendingRequests: new Map(),
			snapshot: ssr ? seedSnapshot(config.initialState, logger) : null,
		},
		logger,
	);
	const events = createEmitter(logger);

	// The store's methods are closures, so they work detached from it.
	const { getState, subscribe } = store;

	return {
		protocols: config.connectors.map((connector) => connector.protocol),
		connectors: new Map(
			config.connectors.map((connector) => [connector.protocol, connector]),
		),
		network: config.network,
		appMetadata: config.appMetadata,
		logger,
		readTimeoutMs: config.defaultTimeoutMs?.read ?? 30_000,
		connectTimeoutMs: config.defaultTimeoutMs?.connect,
		clientStorage: config.storage ?? memory(),
		connectorStorage: memory(),
		disabled: new Map(),
		store,
		publicStore: { getState, subscribe },
		events,
		reportError(error, wrap) {
			events.emit("client:error", {
				error: isBchConnectError(error) ? error : wrap(error),
			});
		},
	};
}
