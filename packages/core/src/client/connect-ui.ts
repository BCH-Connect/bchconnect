import { ConfigError } from "../errors.js";
import { combineSignals, isTimeoutMs, withTimeout } from "../internal/abort.js";
import type { ConnectOptions, ConnectUi } from "../types/client.js";
import type { Session } from "../types/protocol.js";
import type { Lifetime } from "./lifetime.js";
import type { ClientRuntime } from "./runtime.js";
import type { Sessions } from "./sessions.js";

/**
 * Routes `connect()`: to the configured UI when the caller renders no
 * pairing, else straight to the sessions.
 *
 * @internal
 */
export interface ConnectRouter {
	/** Establishes a session, as `ClientLifecycle.connect`. */
	connect(protocol?: string, options?: ConnectOptions): Promise<Session>;
}

/**
 * Creates the {@link ConnectRouter} of one client.
 *
 * @example
 * ```ts
 * const router = createConnectRouter(runtime, lifetime, sessions, config.ui);
 * const session = await router.connect();
 * ```
 *
 * @internal
 */
export function createConnectRouter(
	runtime: ClientRuntime,
	lifetime: Lifetime,
	sessions: Sessions,
	ui: ConnectUi | undefined,
): ConnectRouter {
	let open = false;

	async function viaUi(
		ui: ConnectUi,
		protocol: string | undefined,
		options: ConnectOptions,
	) {
		if (protocol !== undefined && !runtime.connectors.has(protocol)) {
			throw new ConfigError(`Unknown protocol: ${protocol}`);
		}
		if (options.timeoutMs !== undefined && !isTimeoutMs(options.timeoutMs)) {
			throw new ConfigError(`Invalid timeoutMs: ${options.timeoutMs}`);
		}
		if (open) throw new ConfigError("The ui is already handling a connect()");

		open = true;
		const signals = combineSignals([options.signal, lifetime.signal]);
		let ended = false;
		// The UI stays open until its own promise settles, even after the call
		// has ended, so a second call cannot mount a second UI while it closes.
		const handled = (async () => {
			await lifetime.whenReady("connect");
			signals.signal.throwIfAborted();
			if (protocol !== undefined && runtime.disabled.has(protocol)) {
				throw new ConfigError(`Connector "${protocol}" failed setup`, {
					cause: runtime.disabled.get(protocol),
				});
			}
			return ui.connect({
				protocols: runtime.protocols.filter((id) => !runtime.disabled.has(id)),
				protocol: protocol ?? null,
				network: runtime.network,
				signal: signals.signal,
				async connect(attempt, opts = {}) {
					if (ended) {
						throw new ConfigError(
							"The connect() the ui was handling has ended",
						);
					}
					if (protocol !== undefined && attempt !== protocol) {
						throw new ConfigError(`The ui may only connect over "${protocol}"`);
					}
					const signal = combineSignals([opts.signal, signals.signal]);
					const request: ConnectOptions = {
						...options,
						...opts,
						signal: signal.signal,
					};
					try {
						return await sessions.connect(attempt, request);
					} finally {
						signal.release();
					}
				},
			});
		})().finally(() => {
			open = false;
			signals.release();
		});
		// withTimeout never reads it when the signal is already aborted.
		handled.catch(() => {});

		try {
			return await withTimeout(() => handled, { signal: signals.signal });
		} finally {
			ended = true;
		}
	}

	return {
		connect(protocol, options = {}) {
			if (ui !== undefined && options.onPairing === undefined) {
				return viaUi(ui, protocol, options);
			}
			if (protocol === undefined) {
				return Promise.reject(
					new ConfigError("connect() needs a protocol unless a ui handles it"),
				);
			}
			return sessions.connect(protocol, options);
		},
	};
}
