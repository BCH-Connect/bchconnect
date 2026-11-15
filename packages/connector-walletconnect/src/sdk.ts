/** Dapp identity the SDK sends to the wallet. */
export interface SdkMetadata {
	name: string;
	description: string;
	url: string;
	icons: string[];
}

/** One session as the SDK stores it. */
export interface SdkSession {
	readonly topic: string;
	/** Unix time, in seconds. */
	readonly expiry: number;
	readonly namespaces: Readonly<Record<string, unknown>>;
	/** The SDK does not check that the wallet sent metadata. */
	readonly peer: { readonly metadata?: unknown };
}

/** A namespace the dapp proposes. */
export interface SdkProposalNamespace {
	chains: string[];
	methods: string[];
	events: string[];
}

/** What `connect()` resolves with. */
export interface SdkProposal {
	readonly uri?: string;
	approval(): Promise<SdkSession>;
}

/** The relay connection of the SDK's core. */
export interface SdkRelayer {
	readonly connected: boolean;
	on(
		event: "relayer_connect" | "relayer_disconnect",
		listener: () => void,
	): void;
	off(
		event: "relayer_connect" | "relayer_disconnect",
		listener: () => void,
	): void;
}

/** Payload of `session_update`. */
export interface SdkSessionUpdate {
	readonly topic: string;
	readonly params: { readonly namespaces: unknown };
}

/** Payload of `session_event`. */
export interface SdkSessionEvent {
	readonly topic: string;
	readonly params: { readonly event: { readonly name: string } };
}

/** Payload of `session_delete` and `session_expire`. */
export interface SdkSessionEnd {
	readonly topic: string;
}

/** The SDK events the connector listens to, with their payloads. */
export interface SdkEvents {
	// biome-ignore lint/style/useNamingConvention: SDK event name.
	session_update: SdkSessionUpdate;
	// biome-ignore lint/style/useNamingConvention: SDK event name.
	session_delete: SdkSessionEnd;
	// biome-ignore lint/style/useNamingConvention: SDK event name.
	session_expire: SdkSessionEnd;
	// biome-ignore lint/style/useNamingConvention: SDK event name.
	session_event: SdkSessionEvent;
}

/** The sign client, as the connector uses it. */
export interface SdkSignClient {
	readonly core: {
		readonly relayer: SdkRelayer;
		readonly pairing: {
			disconnect(params: { topic: string }): Promise<void>;
		};
	};
	readonly session: {
		getAll(): readonly SdkSession[];
	};
	connect(params: {
		optionalNamespaces: Record<string, SdkProposalNamespace>;
	}): Promise<SdkProposal>;
	request(params: {
		topic: string;
		chainId: string;
		request: { method: string; params: unknown };
		expiry?: number;
	}): Promise<unknown>;
	disconnect(params: {
		topic: string;
		reason: { code: number; message: string };
	}): Promise<void>;
	on(
		event: "session_update",
		listener: (args: SdkSessionUpdate) => void,
	): unknown;
	on(event: "session_delete", listener: (args: SdkSessionEnd) => void): unknown;
	on(event: "session_expire", listener: (args: SdkSessionEnd) => void): unknown;
	on(
		event: "session_event",
		listener: (args: SdkSessionEvent) => void,
	): unknown;
	off(
		event: "session_update",
		listener: (args: SdkSessionUpdate) => void,
	): unknown;
	off(
		event: "session_delete",
		listener: (args: SdkSessionEnd) => void,
	): unknown;
	off(
		event: "session_expire",
		listener: (args: SdkSessionEnd) => void,
	): unknown;
	off(
		event: "session_event",
		listener: (args: SdkSessionEvent) => void,
	): unknown;
}

/** Options the connector passes to `SignClient.init()`. */
export interface SdkSignClientOptions {
	projectId: string;
	relayUrl?: string;
	metadata: SdkMetadata;
	telemetryEnabled: boolean;
}

/** The `SignClient` class, as the connector uses it. */
export interface SdkSignClientFactory {
	init(options: SdkSignClientOptions): Promise<SdkSignClient>;
}

/**
 * Loads the sign client. The only place the SDK is imported, so it stays out
 * of the dapp's bundle until a connection needs it.
 */
export async function loadSignClient(): Promise<SdkSignClientFactory> {
	const { SignClient } = await import("@walletconnect/sign-client");
	return SignClient;
}
