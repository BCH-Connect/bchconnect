import {
	ConfigError,
	isBchConnectError,
	SessionMissingError,
	TransportError,
} from "../errors.js";
import { combineSignals, isTimeoutMs, withTimeout } from "../internal/abort.js";
import type { RequestOutcome } from "../types/client.js";
import type { RequestOptions, Session } from "../types/protocol.js";
import type { Lifetime } from "./lifetime.js";
import type { ClientRuntime } from "./runtime.js";

/**
 * The envelope the client puts around a connector's `request()`: session
 * check, correlation id, pending state, cancellation and the request events.
 *
 * @internal
 */
export interface Requests {
	request(
		session: Session,
		method: string,
		params: unknown,
		opts?: RequestOptions,
	): Promise<unknown>;
	/** Resolves once every request in flight has settled. */
	settled(): Promise<void>;
	/**
	 * Listens to a protocol event on `session`, as `ClientLifecycle.subscribe`.
	 * The subscription ends with the session, or when the client is disposed.
	 */
	subscribe(
		session: Session,
		event: string,
		listener: (payload: unknown) => void,
	): () => void;
}

interface RequestHandle {
	readonly sessionId: string;
	/** Aborts the request from the client's side, with the error to reject. */
	readonly end: AbortController;
	/** Set when the session ended first; the caller gets it instead of ABORTED. */
	ended: SessionMissingError | undefined;
	readonly settled: Promise<void>;
}

/**
 * Creates the {@link Requests} of one client.
 *
 * @example
 * ```ts
 * const requests = createRequests(runtime, lifetime);
 * const balance = await requests.request(session, "get_balance", { address });
 * ```
 *
 * @internal
 */
export function createRequests(
	runtime: ClientRuntime,
	lifetime: Lifetime,
): Requests {
	const { store } = runtime;
	const handles = new Map<string, RequestHandle>();
	const subscriptions = new Map<string, Set<() => void>>();

	function unsubscribeAll(sessionId: string) {
		const unsubscribes = subscriptions.get(sessionId);
		if (unsubscribes === undefined) return;
		subscriptions.delete(sessionId);
		for (const unsubscribe of unsubscribes) unsubscribe();
	}

	runtime.events.on("session:disconnected", ({ sessionId, reason }) => {
		for (const handle of handles.values()) {
			if (handle.sessionId !== sessionId) continue;
			handle.ended = new SessionMissingError(
				`Session "${sessionId}" disconnected`,
				{ sessionId, cause: reason },
			);
			handle.end.abort(handle.ended);
		}
		unsubscribeAll(sessionId);
	});
	lifetime.signal.addEventListener("abort", () => {
		for (const sessionId of [...subscriptions.keys()])
			unsubscribeAll(sessionId);
	});

	function subscribe(
		passedSession: Session,
		event: string,
		listener: (payload: unknown) => void,
	): () => void {
		const sessionId = passedSession.id;
		const session = store.getState().sessions.get(sessionId);
		const connector = session
			? runtime.connectors.get(session.protocol)
			: undefined;
		if (session === undefined || connector === undefined) {
			throw new SessionMissingError(
				`Session "${sessionId}" is not currently connected`,
				{ sessionId },
			);
		}

		const unsubscribeFromConnector = connector.subscribe(
			session,
			event,
			listener,
		);
		const unsubscribes = subscriptions.get(sessionId) ?? new Set();
		subscriptions.set(sessionId, unsubscribes);
		const unsubscribe = () => {
			if (!unsubscribes.delete(unsubscribe)) return;
			if (unsubscribes.size === 0) subscriptions.delete(sessionId);
			unsubscribeFromConnector();
		};
		unsubscribes.add(unsubscribe);
		return unsubscribe;
	}

	async function request(
		passedSession: Session,
		method: string,
		params: unknown,
		opts: RequestOptions = {},
	): Promise<unknown> {
		const { sessions, pendingRequests } = store.getState();
		const sessionId = passedSession.id;
		// We get it from the store because the passed session could be an older snapshot.
		const session = sessions.get(sessionId);
		const connector = session
			? runtime.connectors.get(session.protocol)
			: undefined;

		if (session === undefined || connector === undefined) {
			throw new SessionMissingError(
				`Session "${sessionId}" is not currently connected`,
				{
					sessionId,
				},
			);
		}

		const id = opts.id ?? crypto.randomUUID();
		if (pendingRequests.has(id)) {
			throw new ConfigError(`Request "${id}" is already pending`);
		}
		const metadata = connector.methods?.[method];
		const userInteraction = metadata?.userInteraction === true;
		const timeoutMs =
			opts.timeoutMs ??
			metadata?.timeoutMs ??
			(userInteraction
				? runtime.userInteractionTimeoutMs
				: runtime.readTimeoutMs);
		if (timeoutMs !== undefined && !isTimeoutMs(timeoutMs)) {
			throw new ConfigError(`Invalid timeoutMs: ${timeoutMs}`);
		}

		let done = () => {};
		const handle: RequestHandle = {
			sessionId,
			end: new AbortController(),
			ended: undefined,
			settled: new Promise<void>((resolve) => {
				done = resolve;
			}),
		};
		// Before anything is tracked: a caller's signal that is not one throws here.
		const combined = combineSignals([
			opts.signal,
			lifetime.signal,
			handle.end.signal,
		]);

		store.setState((state) => ({
			...state,
			pendingRequests: new Map(state.pendingRequests).set(id, {
				sessionId,
				method,
				userInteraction,
				startedAt: Date.now(),
			}),
		}));
		runtime.events.emit("request:pending", {
			id,
			sessionId,
			method,
			userInteraction,
		});

		let outcome: RequestOutcome = "resolved";
		handles.set(id, handle);
		try {
			return await withTimeout(
				(signal) =>
					connector.request(session, method, params, {
						signal,
						id,
						// Omitted when there is no deadline; connectors read its absence as none.
						...(timeoutMs === undefined ? {} : { timeoutMs }),
					}),
				{
					signal: combined.signal,
					timeoutMs,
					timeoutMessage: `Request "${method}" timed out`,
				},
			);
		} catch (error) {
			// The session's end is the caller's error only when it is what aborted
			// the call; an earlier abort, deadline or failure keeps its own.
			const failure =
				handle.ended !== undefined && combined.signal.reason === handle.ended
					? handle.ended
					: isBchConnectError(error)
						? error
						: new TransportError(`Request "${method}" failed`, {
								cause: error,
								sessionId,
							});
			switch (failure.code) {
				case "TIMEOUT":
					outcome = "timeout";
					break;
				case "ABORTED":
					outcome = "aborted";
					break;
				default:
					outcome = "rejected";
			}
			throw failure;
		} finally {
			combined.release();
			handles.delete(id);
			done();
			store.setState((state) => {
				if (!state.pendingRequests.has(id)) return state;
				const pendingRequests = new Map(state.pendingRequests);
				pendingRequests.delete(id);
				return { ...state, pendingRequests };
			});
			runtime.events.emit("request:settled", { id, sessionId, outcome });
		}
	}

	return {
		request,
		subscribe,
		async settled() {
			await Promise.all([...handles.values()].map((handle) => handle.settled));
		},
	};
}
