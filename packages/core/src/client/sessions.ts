import {
	ConfigError,
	isBchConnectError,
	SessionMissingError,
	TransportError,
} from "../errors.js";
import { combineSignals, isTimeoutMs, withTimeout } from "../internal/abort.js";
import type {
	ConnectOptions,
	ConnectorEventName,
	LifecycleEvents,
} from "../types/client.js";
import type { Connector, Session } from "../types/protocol.js";
import type { Lifetime } from "./lifetime.js";
import type { ClientRuntime } from "./runtime.js";
import { keepWalletIdentity, mergeWalletIdentity } from "./wallet-identity.js";

type SessionEndReason = LifecycleEvents["session:disconnected"]["reason"];

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
	/** Makes `session` current, or clears it, as `ClientLifecycle.setCurrent`. */
	setCurrent(session: Session | null): void;
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

	// Never rejects: a failure, or outlasting `timeoutMs`, goes to client:error.
	// `disconnect()` takes no signal, so a late connector call is not cancelled.
	async function disconnectOnConnector(session: Session, timeoutMs?: number) {
		const { protocol } = session;
		try {
			// Async, so a synchronous throw is reported too.
			await withTimeout(
				async () => runtime.connectors.get(protocol)?.disconnect(session),
				{
					timeoutMs,
					timeoutMessage: `disconnect() timed out for connector "${protocol}"`,
				},
			);
		} catch (error) {
			runtime.reportError(
				error,
				(cause) =>
					new TransportError(
						`disconnect() failed for connector "${protocol}"`,
						{ cause },
					),
			);
		}
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
			await disconnectOnConnector(session, runtime.readTimeoutMs);
		},
		setCurrent(session) {
			// By id: the caller may hold a stale copy of the session.
			const id = session?.id ?? null;
			if (id !== null && !store.getState().sessions.has(id)) {
				throw new SessionMissingError(
					"setCurrent() was given a session that is not connected",
					{ sessionId: id },
				);
			}

			store.setState((state) =>
				state.currentSessionId === id
					? state
					: { ...state, currentSessionId: id },
			);
		},
	};
}
