import { ConfigError, TransportError } from "../errors.js";
import { withTimeout } from "../internal/abort.js";
import {
	parseSnapshot,
	SNAPSHOT_KEY,
	serializeSnapshot,
	toSnapshot,
} from "../snapshot.js";
import { connectorPrefix, namespaced } from "../storage/namespace.js";
import type {
	ClientSnapshot,
	ConnectorEventName,
	LifecycleEvents,
} from "../types/client.js";
import type { ConnectorContext, Network, Session } from "../types/protocol.js";
import type { ClientRuntime } from "./runtime.js";
import { mergeWalletIdentity } from "./sessions.js";

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
	 * every connector whose setup succeeded, reconciles the ssr snapshot, and
	 * marks the client ready. Every call returns the promise of the first.
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
 * Gives a restored session back the wallet identity saved for it, when the
 * saved entry describes that same session.
 */
function withSavedIdentity(
	session: Session,
	entry: ClientSnapshot["sessions"][number] | undefined,
	network: Network,
) {
	if (
		entry === undefined ||
		entry.protocol !== session.protocol ||
		entry.network !== network
	) {
		return session;
	}

	const merged = mergeWalletIdentity(session, entry.wallet);
	if (merged === session || session.wallet.name !== undefined) return merged;

	// if the protocol hasn't provided the name, the saved entry defines the source
	return {
		...merged,
		wallet: { ...merged.wallet, source: entry.wallet.source },
	};
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
 * Every ssr snapshot session that did not come back is announced as
 * `session:disconnected` with reason `"expired"`, after the state is ready
 * and before `init()` resolves.
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
	let persisting = false;
	// What storage holds: a snapshot, `undefined` for none, `null` for unknown
	// after a failed write, so the next notification writes again.
	let persisted: string | undefined | null;
	let writes = Promise.resolve();

	// Runs inside store notifications, so it must never throw: failures
	// surface asynchronously through the write chain.
	function persist() {
		if (!persisting) return;

		const state = store.getState();
		const value =
			state.sessions.size === 0
				? undefined
				: serializeSnapshot(toSnapshot(state, runtime.network));
		if (value === persisted) return;

		persisted = value;
		writes = writes
			.then(() =>
				value === undefined
					? runtime.clientStorage.delete(SNAPSHOT_KEY)
					: runtime.clientStorage.set(SNAPSHOT_KEY, value),
			)
			.catch((error: unknown) => {
				persisted = null;
				runtime.reportError(
					error,
					(cause) =>
						new TransportError("Writing the client snapshot failed", {
							cause,
						}),
				);
			});
	}

	store.subscribe(persist);

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

		const [reference, restored] = await Promise.all([
			readSnapshot(),
			restoreAll(),
		]);
		const saved = new Map(
			reference?.sessions.map((entry) => [entry.id, entry] as const),
		);
		const sessions = new Map(
			restored.map(
				(session) =>
					[
						session.id,
						withSavedIdentity(session, saved.get(session.id), runtime.network),
					] as const,
			),
		);
		const { snapshot } = store.getState();

		persisted = reference && serializeSnapshot(reference);
		persisting = true;
		store.setState((state) => ({
			...state,
			status: "ready",
			sessions,
			currentSessionId: selectCurrent(sessions, reference),
			snapshot: null,
		}));

		for (const { id } of snapshot?.sessions ?? []) {
			if (sessions.has(id)) continue;
			runtime.events.emit("session:disconnected", {
				sessionId: id,
				reason: "expired",
			});
		}
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

		return restored.flat();
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
