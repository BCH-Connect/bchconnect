import { ConfigError } from "../errors.js";
import { isNetwork } from "../snapshot.js";
import type {
	Client,
	ClientConfig,
	ClientLifecycle,
	ProtocolOf,
} from "../types/client.js";
import type { Connector } from "../types/protocol.js";
import { createClientRuntime } from "./runtime.js";

type ClientImpl = Pick<
	ClientLifecycle,
	"protocols" | "status" | "sessions" | "store"
>;

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
 * // The protocol the user picked, e.g. in the connect modal.
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
	const { store } = runtime;
	const client: ClientImpl = {
		protocols: runtime.protocols,
		get status() {
			return store.getState().status;
		},
		get sessions() {
			return store.getState().sessions;
		},
		store: runtime.publicStore,
	};

	// The protocol union only narrows types; at runtime the client is
	// protocol-agnostic, and `Client<P>` is invariant in `P`, so no
	// protocol-agnostic object is assignable to it.
	return client as Client<ProtocolOf<Connectors[number]>>;
}
