import { ConfigError } from "../errors.js";
import { isTimeoutMs } from "../internal/abort.js";
import { isNetwork } from "../snapshot.js";
import type { CapabilityRegistry } from "../types/capabilities.js";
import type {
	Client,
	ClientConfig,
	ClientLifecycle,
	ProtocolOf,
} from "../types/client.js";
import type { Connector, RequestOptions, Session } from "../types/protocol.js";
import { createLifecycle } from "./lifecycle.js";
import { createLifetime } from "./lifetime.js";
import { createClientRuntime } from "./runtime.js";
import { createSessions } from "./sessions.js";

// `Client` with every protocol-typed member loosened to `Session`.
interface ClientImpl extends ClientLifecycle {
	session(protocol: string): Session | null;
	request(
		session: Session,
		method: string,
		params: unknown,
		opts?: RequestOptions,
	): Promise<unknown>;
	subscribe(
		session: Session,
		event: string,
		listener: (payload: unknown) => void,
	): () => void;
	capability(session: Session, name: keyof CapabilityRegistry): unknown;
	can(session: Session, name: string): boolean;
}

function notImplemented(method: string): ConfigError {
	return new ConfigError(`${method}() is not implemented yet`);
}

// thorough runtime validation for non-typescript consumers
function validate(config: ClientConfig<readonly Connector[]>): void {
	if (config.network === undefined) throw new ConfigError("Missing network");
	if (!isNetwork(config.network)) {
		throw new ConfigError(`Unknown network: ${config.network}`);
	}

	const protocols = new Set<string>();
	for (const { protocol } of config.connectors) {
		if (protocol.includes(":")) {
			throw new ConfigError(`Reserved ":" in protocol id: ${protocol}`);
		}
		if (protocols.has(protocol)) {
			throw new ConfigError(`Duplicate protocol id: ${protocol}`);
		}
		protocols.add(protocol);
	}

	if (config.initialState !== undefined && config.ssr !== true) {
		throw new ConfigError("initialState requires ssr: true");
	}

	for (const [kind, timeoutMs] of Object.entries(
		config.defaultTimeoutMs ?? {},
	)) {
		if (timeoutMs !== undefined && !isTimeoutMs(timeoutMs)) {
			throw new ConfigError(`Invalid defaultTimeoutMs.${kind}: ${timeoutMs}`);
		}
	}
}

/**
 * Creates the client for one dapp: it owns the connectors, the store and
 * every session. Construction validates `config` and performs no I/O.
 * `init()` set up the connectors and restore persisted sessions.
 *
 * @param config - The configuration of the client (connectors, network and app metadata, plus optional
 * storage, SSR, logging and timeout settings).
 * @returns The client, typed by the protocols of `config.connectors`.
 * @throws {@link ConfigError} when there's some issue in the passed configuration.
 *
 * @example
 * ```ts
 * const client = createClient({
 *   connectors: [wizard(), walletConnect({ projectId })],
 *   network: "mainnet",
 *   appMetadata: { name: "My dapp", url: "https://example.com" },
 * });
 *
 * await client.init();
 *
 * // The protocol the user picked e.g. in the connect modal.
 * const session = await client.connect(protocol);
 * ```
 *
 * @public
 */
export function createClient<const Connectors extends readonly Connector[]>(
	config: ClientConfig<Connectors>,
): Client<ProtocolOf<Connectors[number]>> {
	validate(config);

	const runtime = createClientRuntime(config);
	const lifetime = createLifetime();
	const sessions = createSessions(runtime, lifetime);
	const lifecycle = createLifecycle(
		runtime,
		lifetime,
		sessions.onConnectorEvent,
	);
	const { store } = runtime;

	function disposedError(method: string) {
		return new ConfigError(`${method}() cannot be called after dispose()`);
	}

	function assertUsable(method: string) {
		if (store.getState().status === "disposed") throw disposedError(method);
	}

	const client: ClientImpl = {
		protocols: runtime.protocols,
		get status() {
			return store.getState().status;
		},
		get sessions() {
			return store.getState().sessions;
		},
		get current() {
			const { sessions, currentSessionId } = store.getState();
			// A missing id shares the `null` path instead of needing its own guard.
			return (
				(currentSessionId !== null && sessions.get(currentSessionId)) || null
			);
		},
		store: runtime.publicStore,
		init() {
			// Not async: every call must return the same promise.
			return store.getState().status === "disposed"
				? Promise.reject(disposedError("init"))
				: lifecycle.init();
		},
		dispose() {
			return lifecycle.dispose();
		},
		async connect(protocol, opts) {
			assertUsable("connect");
			return sessions.connect(protocol, opts);
		},
		async disconnect() {
			assertUsable("disconnect");
			throw notImplemented("disconnect");
		},
		setCurrent() {
			assertUsable("setCurrent");
			throw notImplemented("setCurrent");
		},
		on(event, listener) {
			assertUsable("on");
			return runtime.events.on(event, listener);
		},
		session() {
			throw notImplemented("session");
		},
		async request() {
			assertUsable("request");
			throw notImplemented("request");
		},
		subscribe() {
			assertUsable("subscribe");
			throw notImplemented("subscribe");
		},
		capability() {
			assertUsable("capability");
			throw notImplemented("capability");
		},
		can() {
			assertUsable("can");
			throw notImplemented("can");
		},
	};

	// The protocol union only narrows types; at runtime the client is
	// protocol-agnostic, and `Client<P>` is invariant in `P`, so no
	// protocol-agnostic object is assignable to it.
	return client as Client<ProtocolOf<Connectors[number]>>;
}
