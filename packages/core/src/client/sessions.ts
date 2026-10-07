import { ConfigError, isBchConnectError, TransportError } from "../errors.js";
import { combineSignals, isTimeoutMs, withTimeout } from "../internal/abort.js";
import type {
	ConnectOptions,
	ConnectorEventName,
	LifecycleEvents,
} from "../types/client.js";
import type { Connector, Session, WalletIdentity } from "../types/protocol.js";
import type { Lifetime } from "./lifetime.js";
import type { ClientRuntime } from "./runtime.js";

type SessionEndReason = LifecycleEvents["session:disconnected"]["reason"];

/**
 * Combines the wallet identity the protocol sent with the wallet the user
 * picked. The protocol's fields win; the pick only fills the ones it left
 * empty. `source` is `"protocol"` when the protocol sent a name, else
 * `"selection"`.
 *
 * Returns `session` as is when there is no pick or the pick fills none of
 * its gaps. Otherwise returns a new session and never modifies the original.
 *
 * @example
 * ```ts
 * const merged = mergeWalletIdentity(session, {
 *   id: "cashonize",
 *   name: "Cashonize",
 * });
 * ```
 *
 * @internal
 */
export function mergeWalletIdentity<S extends Session>(
	session: S,
	selection?: ConnectOptions["wallet"],
): S {
	const { wallet } = session;
	const id = wallet.id ?? selection?.id;
	const name = wallet.name ?? selection?.name;
	const icon = wallet.icon ?? selection?.icon;
	if (id === wallet.id && name === wallet.name && icon === wallet.icon) {
		return session;
	}

	const merged: WalletIdentity = {
		source: wallet.name !== undefined ? "protocol" : "selection",
	};
	if (id !== undefined) merged.id = id;
	if (name !== undefined) merged.name = name;
	if (icon !== undefined) merged.icon = icon;

	return { ...session, wallet: merged };
}

/**
 * Carries an earlier wallet identity of the same session onto a newer
 * snapshot of it.
 *
 * @example
 * ```ts
 * const next = keepWalletIdentity(changed, previous.wallet);
 * ```
 *
 * @internal
 */
export function keepWalletIdentity<S extends Session>(
	session: S,
	wallet: WalletIdentity,
): S {
	const merged = mergeWalletIdentity(session, wallet);
	if (merged === session || session.wallet.name !== undefined) return merged;

	return { ...merged, wallet: { ...merged.wallet, source: wallet.source } };
}

/**
 * Applies the session lifecycle events connectors emit to the client's state,
 * and re-emits them as the client's own.
 *
 * @internal
 */
export interface Sessions {
	/** Handles one event a connector emitted through its context. */
	onConnectorEvent<E extends ConnectorEventName>(
		protocol: string,
		event: E,
		payload: LifecycleEvents[E],
	): void;
	/** Establishes a session over `protocol`, as `ClientLifecycle.connect`. */
	connect(protocol: string, options?: ConnectOptions): Promise<Session>;
	/** Ends `session`, or the current one, as `ClientLifecycle.disconnect`. */
	disconnect(session?: Session): Promise<void>;
}

interface PendingConnect {
	readonly options: ConnectOptions;
	signal: AbortSignal;
	started: boolean;
	adopted: Session | undefined;
	readonly established: Promise<Session>;
	settle(session: Session): void;
}

type ConnectorEventHandlers = {
	[E in ConnectorEventName]: (
		protocol: string,
		payload: LifecycleEvents[E],
	) => void;
};

/**
 * Creates the {@link Sessions} of one client.
 *
 * @example
 * ```ts
 * const sessions = createSessions(runtime, lifetime);
 * const lifecycle = createLifecycle(runtime, lifetime, sessions.onConnectorEvent);
 * ```
 *
 * @internal
 */
export function createSessions(
	runtime: ClientRuntime,
	lifetime: Lifetime,
): Sessions {
	const { store, logger } = runtime;
	const pending = new Map<string, PendingConnect>();

	// Never rejects: a failure goes to client:error.
	async function disconnectOnConnector(session: Session) {
		// Through a promise, so a synchronous throw is reported too.
		return Promise.resolve()
			.then(() => runtime.connectors.get(session.protocol)?.disconnect(session))
			.catch((error: unknown) =>
				runtime.reportError(
					error,
					(cause) =>
						new TransportError(
							`disconnect() failed for connector "${session.protocol}"`,
							{ cause },
						),
				),
			);
	}

	// A session id already in state is made current and returned as is, with
	// no event.
	function establish(
		raw: Session,
		{ wallet, mode = "replace" }: ConnectOptions,
	) {
		const state = store.getState();
		const existing = state.sessions.get(raw.id);
		if (existing !== undefined) {
			store.setState((state) =>
				state.currentSessionId === existing.id
					? state
					: { ...state, currentSessionId: existing.id },
			);
			return existing;
		}

		const session = mergeWalletIdentity(raw, wallet);
		const previous =
			mode === "replace" && state.currentSessionId !== null
				? state.sessions.get(state.currentSessionId)
				: undefined;

		store.setState((state) => {
			const sessions = new Map(state.sessions);
			if (previous !== undefined) sessions.delete(previous.id);
			sessions.set(session.id, session);
			return { ...state, sessions, currentSessionId: session.id };
		});
		runtime.events.emit("session:connected", { session });
		if (previous !== undefined) {
			runtime.events.emit("session:disconnected", {
				sessionId: previous.id,
				reason: "user",
			});
			void disconnectOnConnector(previous);
		}

		return session;
	}

	// The first session a call yields is adopted. Any other one, or one that
	// arrives after the call ended, is disconnected unless it is already in
	// state.
	function adopt(call: PendingConnect, raw: Session) {
		if (call.adopted !== undefined || call.signal.aborted) {
			if (!store.getState().sessions.has(raw.id))
				void disconnectOnConnector(raw);
			return;
		}

		call.adopted = establish(raw, call.options);
		call.settle(call.adopted);
	}

	// Settles on the first establishment: the connector resolving, or the
	// connector emitting session:connected while this call is in flight.
	async function connectOver(
		protocol: string,
		connector: Connector,
		call: PendingConnect,
		deadline: number | undefined,
	) {
		const { options, signal } = call;
		await lifetime.whenReady("connect");
		signal.throwIfAborted();
		if (runtime.disabled.has(protocol)) {
			throw new ConfigError(`Connector "${protocol}" failed setup`, {
				cause: runtime.disabled.get(protocol),
			});
		}

		const request: Parameters<Connector["connect"]>[0] = { signal };
		if (options.onPairing !== undefined) request.onPairing = options.onPairing;
		// The deadline counts from the call, so the connector gets what is left.
		if (deadline !== undefined) {
			request.timeoutMs = Math.max(deadline - Date.now(), 1);
		}

		call.started = true;
		// Through a promise, so a synchronous throw is wrapped too.
		const fromConnector = Promise.resolve()
			.then(() => connector.connect(request))
			.then(
				(raw) => {
					adopt(call, raw);
					return call.established;
				},
				(error: unknown) => {
					throw isBchConnectError(error)
						? error
						: new TransportError(
								`connect() failed for connector "${protocol}"`,
								{
									cause: error,
								},
							);
				},
			);
		return Promise.race([fromConnector, call.established]);
	}

	function remove(sessionId: string, reason: SessionEndReason) {
		store.setState((state) => {
			const sessions = new Map(state.sessions);
			sessions.delete(sessionId);
			return {
				...state,
				sessions,
				currentSessionId:
					state.currentSessionId === sessionId ? null : state.currentSessionId,
			};
		});
		runtime.events.emit("session:disconnected", { sessionId, reason });
	}

	const handlers: ConnectorEventHandlers = {
		"session:connected"(protocol, { session }) {
			const connect = pending.get(protocol);
			if (connect?.started !== true) {
				logger.warn(
					`Ignoring session:connected from "${protocol}": no connect() is pending`,
				);
				return;
			}

			adopt(connect, session);
		},
		"session:changed"(protocol, { session }) {
			const previous = store.getState().sessions.get(session.id);
			if (previous === undefined || previous === session) return;
			if (previous.protocol !== protocol) {
				logger.warn(
					`Ignoring session:changed from "${protocol}" for a "${previous.protocol}" session`,
				);
				return;
			}

			const next = keepWalletIdentity(session, previous.wallet);
			store.setState((state) => ({
				...state,
				sessions: new Map(state.sessions).set(next.id, next),
			}));
			runtime.events.emit("session:changed", { session: next, previous });
		},
		"session:disconnected"(protocol, { sessionId, reason }) {
			const session = store.getState().sessions.get(sessionId);
			if (session === undefined) return;
			if (session.protocol !== protocol) {
				logger.warn(
					`Ignoring session:disconnected from "${protocol}" for a "${session.protocol}" session`,
				);
				return;
			}

			remove(sessionId, reason);
		},
	};

	return {
		onConnectorEvent(protocol, event, payload) {
			if (store.getState().status === "disposed") return;
			if (runtime.disabled.has(protocol)) {
				logger.warn(`Ignoring ${event} from "${protocol}": its setup failed`);
				return;
			}

			handlers[event](protocol, payload);
		},
		async connect(protocol, options = {}) {
			const connector = runtime.connectors.get(protocol);
			if (connector === undefined) {
				throw new ConfigError(`Unknown protocol: ${protocol}`);
			}
			if (pending.has(protocol)) {
				throw new ConfigError(`connect() is already pending for "${protocol}"`);
			}
			if (options.timeoutMs !== undefined && !isTimeoutMs(options.timeoutMs)) {
				throw new ConfigError(`Invalid timeoutMs: ${options.timeoutMs}`);
			}

			const timeoutMs = options.timeoutMs ?? runtime.connectTimeoutMs;
			const deadline =
				timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
			const signals = combineSignals([options.signal, lifetime.signal]);
			let settle: (session: Session) => void = () => {};
			const established = new Promise<Session>((resolve) => {
				settle = resolve;
			});
			const call: PendingConnect = {
				options,
				signal: signals.signal,
				started: false,
				adopted: undefined,
				established,
				settle,
			};
			pending.set(protocol, call);

			try {
				return await withTimeout(
					(signal) => {
						call.signal = signal;
						return connectOver(protocol, connector, call, deadline);
					},
					{
						signal: signals.signal,
						timeoutMs,
						timeoutMessage: `connect() timed out for "${protocol}"`,
					},
				);
			} finally {
				pending.delete(protocol);
				signals.release();
			}
		},
		async disconnect(target) {
			await lifetime.whenReady("disconnect");
			lifetime.signal.throwIfAborted();
			const { sessions, currentSessionId } = store.getState();
			const id = target?.id ?? currentSessionId;
			const session = id === null ? undefined : sessions.get(id);
			if (session === undefined) return;

			remove(session.id, "user");
			await disconnectOnConnector(session);
		},
	};
}
