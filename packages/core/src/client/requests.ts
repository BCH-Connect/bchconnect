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
		if (opts.timeoutMs !== undefined && !isTimeoutMs(opts.timeoutMs)) {
			throw new ConfigError(`Invalid timeoutMs: ${opts.timeoutMs}`);
		}

		const metadata = connector.methods?.[method];
		const userInteraction = metadata?.userInteraction === true;
		const timeoutMs =
			opts.timeoutMs ??
			metadata?.timeoutMs ??
			(userInteraction
				? runtime.userInteractionTimeoutMs
				: runtime.readTimeoutMs);

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

		const combined = combineSignals([opts.signal, lifetime.signal]);
		let outcome: RequestOutcome = "resolved";
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
			const failure = isBchConnectError(error)
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
			store.setState((state) => {
				if (!state.pendingRequests.has(id)) return state;
				const pendingRequests = new Map(state.pendingRequests);
				pendingRequests.delete(id);
				return { ...state, pendingRequests };
			});
			runtime.events.emit("request:settled", { id, sessionId, outcome });
		}
	}

	return { request };
}
