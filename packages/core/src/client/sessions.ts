import type {
	ConnectOptions,
	ConnectorEventName,
	LifecycleEvents,
} from "../types/client.js";
import type { Session, WalletIdentity } from "../types/protocol.js";
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
 * const sessions = createSessions(runtime);
 * const lifecycle = createLifecycle(runtime, sessions.onConnectorEvent);
 * ```
 *
 * @internal
 */
export function createSessions(runtime: ClientRuntime): Sessions {
	const { store, logger } = runtime;

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
		"session:connected"(protocol) {
			logger.warn(
				`Ignoring session:connected from "${protocol}": no connect() is pending`,
			);
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
	};
}
