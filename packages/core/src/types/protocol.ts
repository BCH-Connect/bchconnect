import type { ConnectorEventName, LifecycleEvents } from "./client.js";

/**
 * Metadata for one request-shaped method of a protocol.
 *
 * @public
 */
export interface MethodDefinition {
	/** Parameters the dapp passes. */
	params: unknown;
	/** Result the wallet returns, after validation. */
	result: unknown;
	/** Default timeout for this method in milliseconds. */
	timeoutMs?: number;
	/** True when the method waits on human approval in the wallet. */
	userInteraction?: boolean;
}

/**
 * The type-level description of one protocol. Each protocol package exports one.
 *
 * @public
 */
export interface ProtocolDefinition {
	/** Stable identifier, e.g. `"wizardconnect"`. Discriminates sessions. */
	id: string;
	/** Type of the handshake payload delivered when a session is established. */
	session: unknown;
	/** Request-shaped methods: name to params, result and metadata. */
	methods: Record<string, MethodDefinition>;
	/** Wallet-initiated messages: name to payload type. */
	events: Record<string, unknown>;
	/** Literal union of every capability sessions of this protocol may have. */
	capability: string;
}

/**
 * Two-axis session status: transport liveness and peer reachability.
 *
 * @public
 */
export interface SessionStatus {
	/** Whether the pipe is alive right now. */
	transport: "connected" | "reconnecting" | "disconnected";
	/** Whether the wallet is believed to be on the other end. */
	peer: "reachable" | "unreachable" | "unknown";
}

/**
 * Best-effort identity of the wallet on the other end of a session.
 *
 * @public
 */
export interface WalletIdentity {
	/** Registry id when known, e.g. `"cashonize"`. */
	id?: string;
	/** Display name. */
	name?: string;
	/** Icon URL. */
	icon?: string;
	/** Whether identity came from the wire or from the user's wallet selection. */
	source: "protocol" | "selection";
}

/**
 * One established pairing between the dapp and one wallet over one protocol. Immutable snapshot.
 *
 * @public
 */
export interface Session<P extends ProtocolDefinition = ProtocolDefinition> {
	/** Unique within the client and stable across reloads. */
	readonly id: string;
	/** Protocol id. It narrows the type of `data`. */
	readonly protocol: P["id"];
	/** Identity of the wallet. */
	readonly wallet: WalletIdentity;
	/** The protocol's handshake payload. Core never reads it. */
	readonly data: P["session"];
	/** Current status. */
	readonly status: SessionStatus;
}

/**
 * A session of any protocol in `P`, distributed over the union so that
 * `protocol` narrows `data`. Use this instead of `Session<A | B>`.
 *
 * @public
 */
export type SessionOf<P extends ProtocolDefinition> = P extends unknown
	? Session<P>
	: never;

/**
 * Pairing material the user carries to the wallet (QR scan or copy-paste)
 * to start a session.
 *
 * @public
 */
export type Pairing =
	| { kind: "uri"; uri: string; qrUri?: string }
	| { kind: "none" };

/**
 * Per-request options.
 *
 * @public
 */
export interface RequestOptions {
	/** Aborts the request. */
	signal?: AbortSignal;
	/** Overrides the method's default timeout, in milliseconds. */
	timeoutMs?: number;
	/** Correlation id; generated when omitted. */
	id?: string;
}

/**
 * Method names of a protocol. For a union, only names every member has.
 *
 * @public
 */
export type MethodName<P extends ProtocolDefinition> = keyof P["methods"] &
	string;

/**
 * Params type of method `M` of protocol `P`.
 *
 * @example
 * ```ts
 * interface Demo extends ProtocolDefinition {
 *   // id, session, events, capability…
 *   methods: { sign_message: { params: { message: string }; result: string } };
 * }
 *
 * type Params = MethodParams<Demo, "sign_message">; // { message: string }
 * ```
 *
 * @public
 */
export type MethodParams<
	P extends ProtocolDefinition,
	M extends MethodName<P>,
> = Extract<P["methods"][M], MethodDefinition>["params"];

/**
 * Result type of method `M` of protocol `P`.
 *
 * @example
 * ```ts
 * interface Demo extends ProtocolDefinition {
 *   // id, session, events, capability…
 *   methods: { sign_message: { params: { message: string }; result: string } };
 * }
 *
 * type Result = MethodResult<Demo, "sign_message">; // string
 * ```
 *
 * @public
 */
export type MethodResult<
	P extends ProtocolDefinition,
	M extends MethodName<P>,
> = Extract<P["methods"][M], MethodDefinition>["result"];

/**
 * Event names of a protocol. For a union, only names every member has.
 *
 * @public
 */
export type EventName<P extends ProtocolDefinition> = keyof P["events"] &
	string;

/**
 * Payload type of event `E` of protocol `P`.
 *
 * @example
 * ```ts
 * interface Demo extends ProtocolDefinition {
 *   // id, session, methods, capability…
 *   events: { addresses_changed: { addresses: string[] } };
 * }
 *
 * type Payload = EventPayload<Demo, "addresses_changed">; // { addresses: string[] }
 * ```
 *
 * @public
 */
export type EventPayload<
	P extends ProtocolDefinition,
	E extends EventName<P>,
> = P["events"][E];

/**
 * Async key-value storage. Values are strings; serialization is the caller's
 * concern.
 *
 * @public
 */
export interface KeyValueStore {
	/** Returns the value, or `undefined` when absent. */
	get(key: string): Promise<string | undefined>;
	/** Stores a value. */
	set(key: string, value: string): Promise<void>;
	/** Removes a value. */
	delete(key: string): Promise<void>;
}

/**
 * Dapp identity transmitted by protocols that carry it.
 *
 * @public
 */
export interface AppMetadata {
	/** Dapp name. */
	name: string;
	/** Dapp URL. */
	url: string;
	/** Icon URL. */
	icon?: string;
	/** Short description. */
	description?: string;
}

/**
 * Structured logger. Defaults to a no-op.
 *
 * @public
 */
export interface Logger {
	/** Logs at debug level. */
	debug(msg: string, ...data: unknown[]): void;
	/** Logs at info level. */
	info(msg: string, ...data: unknown[]): void;
	/** Logs at warn level. */
	warn(msg: string, ...data: unknown[]): void;
	/** Logs at error level. */
	error(msg: string, ...data: unknown[]): void;
}

/**
 * The dapp's chain context.
 *
 * @public
 */
export type Network = "mainnet" | "chipnet" | "regtest";

/**
 * What the client hands a connector in `setup()`.
 *
 * @public
 */
export interface ConnectorContext {
	/** Storage already namespaced to this connector. */
	storage: KeyValueStore;
	/** The client's network. */
	network: Network;
	/** The dapp's identity. */
	appMetadata: AppMetadata;
	/** The client's logger. */
	logger: Logger;
	/** Emits a session lifecycle event. */
	emit<E extends ConnectorEventName>(
		event: E,
		payload: LifecycleEvents[E],
	): void;
}

/**
 * The adapter implementing one protocol against the core contract.
 *
 * @public
 */
export interface Connector<P extends ProtocolDefinition = ProtocolDefinition> {
	/** Id of the protocol this connector implements. */
	readonly protocol: P["id"];

	/** One-time initialization. Opens no sockets and writes no storage. */
	setup?(ctx: ConnectorContext): Promise<void> | void;

	/**
	 * Establishes a new session. Emits pairing material through `onPairing`
	 * as soon as it exists; resolves when the session is live.
	 */
	connect(opts: {
		signal?: AbortSignal;
		onPairing?: (pairing: Pairing) => void;
		timeoutMs?: number;
	}): Promise<Session<P>>;

	/** Rehydrates persisted sessions. Returns `[]` when none exist. Never prompts. */
	restore(): Promise<Session<P>[]>;

	/** Tears down one session, including its persisted state. Idempotent. */
	disconnect(session: Session<P>): Promise<void>;

	/** Dispatches a protocol method. */
	request<M extends MethodName<P>>(
		session: Session<P>,
		method: M,
		params: MethodParams<P, M>,
		opts?: RequestOptions,
	): Promise<MethodResult<P, M>>;

	/** Subscribes to one protocol event on one session. Returns unsubscribe. */
	subscribe<E extends EventName<P>>(
		session: Session<P>,
		event: E,
		listener: (payload: EventPayload<P, E>) => void,
	): () => void;

	/** The capabilities this session actually has. */
	capabilitiesOf(session: Session<P>): ReadonlySet<P["capability"]>;

	/** Releases resources held by this connector without disconnecting sessions. */
	dispose?(): Promise<void>;
}
