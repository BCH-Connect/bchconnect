import { AbortedError, ConfigError, TransportError } from "../errors.js";
import { withTimeout } from "../internal/abort.js";
import { parseSnapshot, SNAPSHOT_KEY } from "../snapshot.js";
import { connectorPrefix, namespaced } from "../storage/namespace.js";
import type {
	ClientSnapshot,
	ConnectorEventName,
	LifecycleEvents,
} from "../types/client.js";
import type { ConnectorContext, Network, Session } from "../types/protocol.js";
import { createPersistence } from "./persistence.js";
import type { ClientRuntime } from "./runtime.js";
import { keepWalletIdentity } from "./sessions.js";

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
	/**
	 * Moves the client to `"disposed"`, disposes every connector in
	 * registration order, then stops persistence once its queued writes have
	 * landed. Every call returns the promise of the first.
	 */
	dispose(): Promise<void>;
	/**
	 * Resolves once an `init()` that has started resolves. Rejects `CONFIG`
	 * when `init()` was never called, and `ABORTED` when the client is
	 * disposed first.
	 */
	whenReady(method: string): Promise<void>;
}

// Runs `run` on the first call; every call gets its promise, including one
// made while `run` is still starting, since `run`'s first `setState`
// notifies subscribers synchronously and one of them may call again.
function once(run: () => Promise<void>) {
	let promise: Promise<void> | undefined;
	return () => {
		if (promise === undefined) {
			let start = () => {};
			promise = new Promise<void>((resolve) => {
				start = () => resolve(run());
			});
			start();
		}
		return promise;
	};
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

	return keepWalletIdentity(session, entry.wallet);
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
	const persistence = createPersistence(runtime);
	// Aborted by dispose()
	const lifetime = new AbortController();

	function isDisposed() {
		return store.getState().status === "disposed";
	}

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
			if (isDisposed()) return;
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

		if (isDisposed()) return;

		const [reference, restored] = await Promise.all([
			readSnapshot(),
			restoreAll(),
		]);
		// Disposed while restoring: the results are discarded.
		if (isDisposed()) return;
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

		persistence.start(reference);
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

	async function teardown() {
		store.setState((state) => ({
			...state,
			status: "disposed",
			pendingRequests: new Map(),
		}));
		lifetime.abort(new AbortedError("The client was disposed"));

		for (const [protocol, connector] of runtime.connectors) {
			try {
				await connector.dispose?.();
			} catch (error) {
				runtime.reportError(
					error,
					(cause) =>
						new TransportError(`Connector "${protocol}" failed to dispose`, {
							cause,
						}),
				);
			}
		}

		await persistence.stop();
		runtime.events.clear();
	}

	const init = once(initialize);
	let started = false;

	return {
		init() {
			started = true;
			return init();
		},
		dispose: once(teardown),
		whenReady(method) {
			if (!started) {
				return Promise.reject(
					new ConfigError(`${method}() was called before init()`),
				);
			}
			return withTimeout(init, { signal: lifetime.signal });
		},
	};
}
