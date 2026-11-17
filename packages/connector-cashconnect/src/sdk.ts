import type { CashConnectTemplate } from "./template.js";
import type { CashConnectChain } from "./types.js";

/**
 * Logger the SDK writes to: core's levels plus `log`.
 *
 * @internal
 */
export interface SdkLogger {
	log(...args: unknown[]): void;
	debug(...args: unknown[]): void;
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

/**
 * What the SDK writes for one dapp identity. `walletPubkey` and
 * `allowedTokens` are `undefined` while the identity is not paired.
 *
 * @internal
 */
export interface SdkSessionState {
	readonly privateKeyHex: string;
	readonly walletPubkey?: string | undefined;
	readonly allowedTokens?: readonly string[] | undefined;
	/** Unix time, in seconds, of the newest event received. */
	readonly lastEventTimestamp?: number | undefined;
}

/**
 * A paired identity, as a store hands it back to the SDK.
 *
 * @internal
 */
export interface SdkPairedState {
	privateKeyHex: string;
	walletPubkey: string;
	allowedTokens: string[];
	/** Unix time, in seconds, of the newest event received. */
	lastEventTimestamp?: number;
}

/**
 * The async key-value store the SDK persists a dapp's identity in.
 *
 * @internal
 */
export interface SdkSessionStore {
	get(key: string): Promise<SdkPairedState | undefined>;
	set(key: string, state: SdkSessionState): Promise<void>;
	delete(key: string): Promise<void>;
	list(): Promise<string[]>;
}

/**
 * The relay client the SDK hands a connection policy.
 *
 * @internal
 */
export interface SdkNostrClient {
	start(): Promise<void>;
	isConnected(): boolean;
	onConnected(callback: () => void): () => void;
	ping(timeoutMs?: number): Promise<void>;
	disconnect(): void;
}

/**
 * A connect and reconnect strategy, applied once when the client starts. It
 * returns its own teardown.
 *
 * @internal
 */
// Taken from a method so the parameter stays bivariant: the SDK types its own
// policies with its client class, whose private fields no slice can match.
export type SdkConnectionPolicy = {
	// biome-ignore lint/suspicious/noConfusingVoidType: the SDK's own policy type.
	policy(client: SdkNostrClient): (() => void) | void;
}["policy"];

/**
 * The `NostrClient` class, as the connector uses it.
 *
 * @internal
 */
export interface SdkNostrClientClass {
	// biome-ignore lint/style/useNamingConvention: SDK method name.
	SmartHeartbeat(): SdkConnectionPolicy;
}

/**
 * Dapp identity the SDK sends to the wallet.
 *
 * @internal
 */
export interface SdkDappInfo {
	name: string;
	url: string;
	icon?: string;
	description?: string;
}

/**
 * A paired wallet, as the SDK reports it.
 *
 * @internal
 */
export interface SdkDappSession {
	readonly walletPubkey: string;
	readonly allowedTokens: readonly string[];
}

/**
 * The SDK events the connector listens to, with their payloads.
 *
 * @internal
 */
export interface SdkDappEvents {
	sessionEstablished: {
		readonly session: SdkDappSession;
		readonly restored: boolean;
	};
	sessionDeleted: undefined;
	balancesChanged: Readonly<Record<string, bigint>>;
	walletReachabilityChanged: boolean;
}

/**
 * Options of one SDK request: its deadline, which is also its relay
 * lifetime, and its cancellation.
 *
 * @internal
 */
export interface SdkRequestOptions {
	timeoutMs: number;
	signal?: AbortSignal;
}

/**
 * One encoded param value: bytes, or groups of them.
 *
 * @internal
 */
export type SdkWireValue =
	| Uint8Array
	| SdkWireValues
	| readonly SdkWireValues[];

/**
 * Encoded params or returns of an action, by name.
 *
 * @internal
 */
export interface SdkWireValues {
	readonly [name: string]: SdkWireValue;
}

/**
 * The wallet's answer to `executeAction`, before the connector checks it.
 *
 * @internal
 */
export interface SdkActionResponse {
	readonly data: unknown;
	readonly transactions: readonly unknown[];
	readonly balanceChanges: Readonly<Record<string, bigint>>;
}

/**
 * One `Dapp` instance: one identity, one relay socket, at most one session.
 *
 * @internal
 */
export interface SdkDapp {
	start(): Promise<void>;
	stop(): Promise<void>;
	createInviteUrl(): string;
	pair(opts: { signal?: AbortSignal }): Promise<SdkDappSession>;
	forgetSession(reason?: string): Promise<void>;
	isSessionActive(): boolean;
	isWalletReachable(): boolean;
	getBalances(
		opts: SdkRequestOptions,
	): Promise<Readonly<Record<string, bigint>>>;
	getTokens(opts: SdkRequestOptions): Promise<unknown[]>;
	executeAction(
		action: string,
		params: SdkWireValues,
		opts: SdkRequestOptions,
	): Promise<SdkActionResponse>;
	on<E extends keyof SdkDappEvents>(
		event: E,
		listener: (payload: SdkDappEvents[E]) => void,
	): () => void;
	off<E extends keyof SdkDappEvents>(
		event: E,
		listener: (payload: SdkDappEvents[E]) => void,
	): void;
}

/**
 * Options the connector passes to the `Dapp` constructor.
 *
 * @internal
 */
export interface SdkDappOptions {
	info: SdkDappInfo;
	chain: CashConnectChain;
	template: CashConnectTemplate;
	allowedTokens: string[];
	store: SdkSessionStore;
	sessionKey: string;
	connectionPolicy: SdkConnectionPolicy;
	logger: SdkLogger;
}

/**
 * The `Dapp` class, as the connector uses it.
 *
 * @internal
 */
export interface SdkDappClass {
	new (options: SdkDappOptions): SdkDapp;
}

/**
 * Bytes as the SDK's primitives hold them.
 *
 * @internal
 */
export interface SdkBytes {
	toUint8Array(): Uint8Array;
	toBigInt(): bigint;
	toUtf8(): string;
	toHex(): string;
}

/**
 * The `Bytes` class, as the codec uses it.
 *
 * @internal
 */
export interface SdkBytesClass {
	from(bytes: Uint8Array): SdkBytes;
	/** Encodes a VM number, minimally. */
	fromBigInt(value: bigint): SdkBytes;
	// biome-ignore lint/style/useNamingConvention: SDK method name.
	fromUTF8(text: string): SdkBytes;
}

/**
 * An address as the SDK's primitives hold it.
 *
 * @internal
 */
export interface SdkAddress {
	toLockscriptBytes(): Uint8Array;
	toCashAddr(prefix: string): string;
}

/**
 * The `Address` class, as the codec uses it.
 *
 * @internal
 */
export interface SdkAddressClass {
	/** Each prefix is tried in turn; an empty one decodes `cashAddr` as given. */
	fromCashAddr(
		cashAddr: string,
		requireTokenSupport: boolean,
		tryPrefixes: string[],
	): SdkAddress;
	fromLockscriptBytes(lockscript: Uint8Array): SdkAddress;
}

/**
 * The `Hasher` class, as the connector uses it.
 *
 * @internal
 */
export interface SdkHasherClass {
	// biome-ignore lint/style/useNamingConvention: SDK method name.
	fromUTF8(text: string): { sha256(): SdkBytes };
}

/**
 * One problem the template schema found.
 *
 * @internal
 */
export interface SdkSchemaIssue {
	readonly path: readonly PropertyKey[];
}

/**
 * The SDK's template schema, as the connector uses it.
 *
 * @internal
 */
export interface SdkTemplateSchema {
	safeParse(value: unknown):
		| { readonly success: true }
		| {
				readonly success: false;
				readonly error: { readonly issues: readonly SdkSchemaIssue[] };
		  };
}

/**
 * The SDK's primitives the codec and the store need.
 *
 * @internal
 */
export interface SdkPrimitives {
	// biome-ignore lint/style/useNamingConvention: SDK class name.
	readonly Bytes: SdkBytesClass;
	// biome-ignore lint/style/useNamingConvention: SDK class name.
	readonly Address: SdkAddressClass;
	// biome-ignore lint/style/useNamingConvention: SDK class name.
	readonly Hasher: SdkHasherClass;
}

/**
 * Everything the connector takes from the SDK once it is loaded.
 *
 * @internal
 */
export interface Sdk extends SdkPrimitives {
	// biome-ignore lint/style/useNamingConvention: SDK class name.
	readonly Dapp: SdkDappClass;
	// biome-ignore lint/style/useNamingConvention: SDK class name.
	readonly NostrClient: SdkNostrClientClass;
	// biome-ignore lint/style/useNamingConvention: SDK export name.
	readonly TemplateSchema: SdkTemplateSchema;
}

let loading: Promise<Sdk> | undefined;

/**
 * Loads the SDK, once. The only place the SDK is imported, so it stays out of
 * the dapp's bundle until a connection needs it. A failed load is retried by
 * the next call.
 *
 * @internal
 */
export function loadSdk(): Promise<Sdk> {
	if (loading === undefined) {
		loading = importSdk();
		loading.catch(() => {
			loading = undefined;
		});
	}
	return loading;
}

async function importSdk(): Promise<Sdk> {
	const [dapp, nostr, primitives, templates] = await Promise.all([
		import("@cashconnect-js/nostr/dapp"),
		import("@cashconnect-js/nostr"),
		import("@cashconnect-js/core/primitives"),
		import("@cashconnect-js/core/templates"),
	]);
	return {
		// Sound because the dapp side only reads the template it is given; the
		// SDK types it as mutable, which a readonly template cannot satisfy.
		// biome-ignore lint/style/useNamingConvention: SDK class name.
		Dapp: dapp.Dapp as SdkDappClass,
		// biome-ignore lint/style/useNamingConvention: SDK class name.
		NostrClient: nostr.NostrClient,
		// biome-ignore lint/style/useNamingConvention: SDK class name.
		Bytes: primitives.Bytes,
		// biome-ignore lint/style/useNamingConvention: SDK class name.
		Address: primitives.Address,
		// biome-ignore lint/style/useNamingConvention: SDK class name.
		Hasher: primitives.Hasher,
		// biome-ignore lint/style/useNamingConvention: SDK export name.
		TemplateSchema: templates.TemplateSchema,
	};
}
