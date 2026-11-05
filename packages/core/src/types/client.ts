import type { BchConnectError } from "../errors.js";
import type { CapabilityRegistry } from "./capabilities.js";
import type {
	AppMetadata,
	Connector,
	EventName,
	EventPayload,
	KeyValueStore,
	Logger,
	MethodName,
	MethodParams,
	MethodResult,
	Network,
	Pairing,
	ProtocolDefinition,
	RequestOptions,
	Session,
	SessionOf,
	WalletIdentity,
} from "./protocol.js";

/**
 * Client lifecycle status. `"disposed"` is terminal.
 *
 * @public
 */
export type ClientStatus = "idle" | "restoring" | "ready" | "disposed";

/**
 * Serializable summary of the client's sessions, small enough for a cookie.
 * Carries no session data and no key material.
 *
 * @public
 */
export interface ClientSnapshot {
	/** Snapshot schema version. Bumped when the persisted shape changes. */
	version: 1;
	/** Id of the current session, or `null`. */
	currentSessionId: string | null;
	/** Identity of each persisted session. */
	sessions: readonly {
		id: string;
		protocol: string;
		wallet: WalletIdentity;
		network: Network;
	}[];
}

/**
 * The client's state. Replaced on every transition (never mutated).
 *
 * @public
 */
export interface ClientState {
	/** Lifecycle status. */
	status: ClientStatus;
	/** Sessions keyed by session id. */
	sessions: ReadonlyMap<string, Session<ProtocolDefinition>>;
	/** Id of the current session, or `null`. Always a key of `sessions` when set. */
	currentSessionId: string | null;
	/** In-flight requests keyed by request id. */
	pendingRequests: ReadonlyMap<
		string,
		{
			sessionId: string;
			method: string;
			userInteraction: boolean;
			startedAt: number;
		}
	>;
	/** SSR snapshot held until `init()` reconciles it; `null` otherwise. */
	snapshot: ClientSnapshot | null;
}

/**
 * External store over {@link ClientState}, compatible with
 * `useSyncExternalStore`.
 *
 * @public
 */
export interface ClientStore {
	/** Returns the current state. */
	getState(): ClientState;
	/** Calls `listener` once per state transition. Returns unsubscribe. */
	subscribe(listener: () => void): () => void;
}

/**
 * Lifecycle events emitted by the client, with their payloads.
 *
 * @public
 */
export interface LifecycleEvents<
	P extends ProtocolDefinition = ProtocolDefinition,
> {
	/** A session was established. */
	"session:connected": { session: SessionOf<P> };
	/** A session was replaced by a new snapshot. */
	"session:changed": { session: SessionOf<P>; previous: SessionOf<P> };
	/** A session ended. */
	"session:disconnected": {
		sessionId: string;
		reason: "user" | "wallet" | "expired" | "error";
	};
	/** A request was dispatched to the wallet. */
	"request:pending": {
		id: string;
		sessionId: string;
		method: string;
		userInteraction: boolean;
	};
	/** A request settled. */
	"request:settled": {
		id: string;
		sessionId: string;
		outcome: "resolved" | "rejected" | "aborted" | "timeout";
	};
	/** A background failure with no caller to reject. */
	"client:error": { error: BchConnectError };
}

/**
 * How a request settled, as `request:settled` reports it.
 *
 * @internal
 */
export type RequestOutcome = LifecycleEvents["request:settled"]["outcome"];

/**
 * The lifecycle events a connector may emit through its context.
 *
 * @public
 */
export type ConnectorEventName =
	| "session:connected"
	| "session:changed"
	| "session:disconnected";

/**
 * Identity of the wallet the user selected in a UI.
 *
 * @public
 */
export interface WalletSelection {
	/** Wallet id, e.g. `"cashonize"`. */
	id?: string;
	/** Display name. */
	name?: string;
	/** Logo URL. */
	icon?: string;
}

/**
 * Options for `connect()`.
 *
 * @public
 */
export interface ConnectOptions {
	/** Aborts the connection attempt. */
	signal?: AbortSignal;
	/** Receives pairing material as soon as it exists. */
	onPairing?: (pairing: Pairing) => void;
	/** Pairing deadline in milliseconds. No deadline by default. */
	timeoutMs?: number;
	/**
	 * What happens to the current session if a new one is established:
	 * `"replace"` (default) disconnects it, `"add"` keeps it. Either way the new
	 * session becomes current.
	 */
	mode?: "replace" | "add";
	/**
	 * Wallet the user selected, used where the protocol supplies no identity.
	 * A function is called when the session is established, so a selection
	 * made after the call started still names it.
	 */
	wallet?: WalletSelection | (() => WalletSelection | undefined);
}

/**
 * What a {@link ConnectUi} receives for one `connect()` call it handles.
 *
 * @public
 */
export interface ConnectUiContext {
	/** Registered protocols the UI may offer, in registration order, without those whose setup failed. */
	readonly protocols: readonly string[];
	/** The protocol the caller passed, the only one the UI may connect over; `null` when the user chooses. */
	readonly protocol: string | null;
	/** The dapp's network. */
	readonly network: Network;
	/** Aborts when the caller aborts or the client is disposed. */
	readonly signal: AbortSignal;
	/**
	 * Starts one attempt over `protocol`. The caller's `connect()` options are
	 * the defaults; `opts` overrides them. Abort the current attempt and let it
	 * settle before starting the next.
	 */
	connect(
		protocol: string,
		opts?: ConnectOptions,
	): Promise<Session<ProtocolDefinition>>;
}

/**
 * A connection UI the client hands every `connect()` that renders no pairing
 * of its own. The UI chooses the protocol and wallet, shows the pairing, and
 * retries; the client runs each attempt.
 *
 * @example
 * ```ts
 * const ui: ConnectUi = {
 *   connect(context) {
 *     return context.connect(context.protocol ?? "wizardconnect", {
 *       signal: context.signal,
 *       onPairing: (pairing) => render(pairing),
 *     });
 *   },
 * };
 * const client = createClient({ connectors, network, appMetadata, ui });
 * ```
 *
 * @public
 */
export interface ConnectUi {
	/**
	 * Handles one `connect()` call. Resolves with the connected session;
	 * rejects `ABORTED` when the user closes the UI or `context.signal` aborts.
	 */
	connect(context: ConnectUiContext): Promise<Session<ProtocolDefinition>>;
}

/**
 * The client surface with no protocol type parameter. Every `Client<P>`
 * satisfies it.
 *
 * @public
 */
export interface ClientLifecycle {
	/** Registered protocol ids, in registration order. */
	readonly protocols: readonly string[];
	/** Lifecycle status, derived from the store. */
	readonly status: ClientStatus;
	/** Sessions keyed by id, derived from the store. */
	readonly sessions: ReadonlyMap<string, Session<ProtocolDefinition>>;
	/** The current session, derived from the store. */
	readonly current: Session<ProtocolDefinition> | null;
	/** The external store. The single source of truth. */
	readonly store: ClientStore;

	/** Runs connector setup, then restores persisted sessions idempotently */
	init(): Promise<void>;
	/**
	 * Releases every connector's resources and moves the client to the
	 * terminal `"disposed"` status, keeping its sessions. Every later call
	 * returns the promise of the first. Every other method then rejects or
	 * throws `CONFIG`, except `session()` and the derived getters, which keep
	 * answering.
	 */
	dispose(): Promise<void>;
	/**
	 * Establishes a session over the given protocol, e.g. `"wizardconnect"`.
	 * With a configured `ui` and no `onPairing`, the UI handles the call; the
	 * protocol may then be omitted to let the user choose.
	 */
	connect(
		protocol?: string,
		opts?: ConnectOptions,
	): Promise<Session<ProtocolDefinition>>;
	/** Ends a session; the current one when omitted. */
	disconnect(session?: Session<ProtocolDefinition>): Promise<void>;
	/** Makes a session current, or clears the current session. */
	setCurrent(session: Session<ProtocolDefinition> | null): void;
	/** Listens to a lifecycle event. Returns unsubscribe. */
	on<E extends keyof LifecycleEvents>(
		event: E,
		listener: (payload: LifecycleEvents[E]) => void,
	): () => void;
}

/**
 * The protocol in `P` that session `S` belongs to.
 *
 * @public
 */
export type ProtocolFor<
	P extends ProtocolDefinition,
	S extends { protocol: string },
> = Extract<P, { id: S["protocol"] }>;

/**
 * The interface for capability `N` on protocol `P`: the registry entry or
 * `null` when `P` may have it, `null` when it never can.
 *
 * @public
 */
export type CapabilityFor<
	P extends ProtocolDefinition,
	N extends keyof CapabilityRegistry,
> = N extends P["capability"] ? CapabilityRegistry[N] | null : null;

/**
 * The client, typed by the union `P` of its registered protocols.
 *
 * @public
 */
export interface Client<P extends ProtocolDefinition = ProtocolDefinition>
	extends ClientLifecycle {
	/** Type-level only, never set. Lets `Client<infer P>` infer `P`. */
	readonly "~protocols"?: P;

	/** Registered protocol ids, in registration order. */
	readonly protocols: readonly P["id"][];
	/** Sessions keyed by id, derived from the store. */
	readonly sessions: ReadonlyMap<string, SessionOf<P>>;
	/** The current session, derived from the store. */
	readonly current: SessionOf<P> | null;

	/**
	 * Establishes a session over the given protocol, e.g. `"wizardconnect"`.
	 * With a configured `ui` and no `onPairing`, the UI handles the call; the
	 * protocol may then be omitted to let the user choose.
	 */
	connect<K extends P["id"] = P["id"]>(
		protocol?: K,
		opts?: ConnectOptions,
	): Promise<SessionOf<Extract<P, { id: K }>>>;
	/** Ends a session; the current one when `"session"` param is omitted. */
	disconnect(session?: SessionOf<P>): Promise<void>;
	/** Makes a session current, or clears the current session. */
	setCurrent(session: SessionOf<P> | null): void;
	/** Listens to a lifecycle event. Returns unsubscribe. */
	on<E extends keyof LifecycleEvents<P>>(
		event: E,
		listener: (payload: LifecycleEvents<P>[E]) => void,
	): () => void;

	/**
	 * The current session if it belongs to `protocol`, else the most recently
	 * connected session of `protocol`, else `null`.
	 */
	session<K extends P["id"]>(
		protocol: K,
	): SessionOf<Extract<P, { id: K }>> | null;

	/** Sends a protocol method over a session. */
	request<S extends SessionOf<P>, M extends MethodName<ProtocolFor<P, S>>>(
		session: S,
		method: M,
		params: MethodParams<ProtocolFor<P, S>, M>,
		opts?: RequestOptions,
	): Promise<MethodResult<ProtocolFor<P, S>, M>>;

	/** Subscribes to a protocol event on a session. Returns unsubscribe. */
	subscribe<S extends SessionOf<P>, E extends EventName<ProtocolFor<P, S>>>(
		session: S,
		event: E,
		listener: (payload: EventPayload<ProtocolFor<P, S>, E>) => void,
	): () => void;

	/**
	 * The session's interface for a registered capability, or `null` when the
	 * session lacks it or its connector supplies none. Calls through the
	 * interface go through `request()`. Throws `SESSION_MISSING` when the
	 * session is no longer connected.
	 */
	capability<S extends SessionOf<P>, N extends keyof CapabilityRegistry>(
		session: S,
		name: N,
	): CapabilityFor<ProtocolFor<P, S>, N>;

	/**
	 * Whether the session has a capability, by name, registered or not. On a
	 * session whose protocol is not narrowed it accepts the name of any
	 * protocol's capability, and answers `false` for names its own protocol
	 * never has.
	 *
	 * @throws `SESSION_MISSING` when the session is no longer connected.
	 */
	can<S extends SessionOf<P>>(
		session: S,
		name: ProtocolFor<P, S>["capability"],
	): boolean;
}

/**
 * The protocol a connector implements.
 *
 * @public
 */
export type ProtocolOf<C> = C extends Connector<infer P> ? P : never;

/**
 * Configuration for `createClient`.
 *
 * @public
 */
export interface ClientConfig<Connectors extends readonly Connector[]> {
	/** Connector instances, one per protocol. */
	connectors: Connectors;
	/** The dapp's network, fixed for the client's lifetime. */
	network: Network;
	/** The dapp's identity. */
	appMetadata: AppMetadata;
	/** Client-tier storage. Defaults to localStorage when available, else memory. */
	storage?: KeyValueStore;
	/** Defers restoration to an explicit `init()` and accepts `initialState`. */
	ssr?: boolean;
	/** Snapshot that seeds the state under `ssr`. */
	initialState?: ClientSnapshot;
	/** Logger threaded through the client and connectors. */
	logger?: Logger;
	/** Connection UI that handles `connect()` calls rendering no pairing of their own. */
	ui?: ConnectUi;
	/** Fallback timeouts in milliseconds. Reads default to 30 000; the others to none. */
	defaultTimeoutMs?: {
		read?: number;
		userInteraction?: number;
		connect?: number;
	};
}

/**
 * Augment with `client: typeof client` to type every registered accessor.
 *
 * @example
 * ```ts
 * declare module "@bchconnect/core" {
 *   interface Register {
 *     client: typeof client;
 *   }
 * }
 * ```
 *
 * @public
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmentation target.
export interface Register {}

/**
 * The registered client type, or `Client<ProtocolDefinition>` when
 * {@link Register} is not augmented.
 *
 * @public
 */
export type RegisteredClient = Register extends { client: infer C }
	? C
	: Client<ProtocolDefinition>;

/**
 * A session of any registered protocol.
 *
 * @public
 */
export type RegisteredSession =
	RegisteredClient extends Client<infer P>
		? SessionOf<P>
		: Session<ProtocolDefinition>;
