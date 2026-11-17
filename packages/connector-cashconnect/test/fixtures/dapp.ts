import type {
	SdkActionResponse,
	SdkConnectionPolicy,
	SdkDapp,
	SdkDappClass,
	SdkDappEvents,
	SdkDappOptions,
	SdkDappSession,
	SdkNostrClient,
	SdkNostrClientClass,
	SdkRequestOptions,
	SdkWireValues,
} from "../../src/sdk.js";

/** The wallet key the fake pairs with unless a test gives another. */
export const WALLET = "22".repeat(32);

/** The relay every fake invite names. */
export const RELAY = "wss://relay.example";

/** The SDK's error for a pairing or request the dapp cancelled. */
export class ErrorUserRejected extends Error {
	override name = "ErrorUserRejected";
}

/** The SDK's error for an action the wallet declined or failed. */
export class ErrorWalletRejected extends Error {
	override name = "ErrorWalletRejected";
}

/** The SDK's error for a read the wallet answered with an error. */
export class RpcRemoteError extends Error {
	override name = "RPCRemoteError";
	readonly remoteMessage: string;

	constructor(method: string, remoteMessage: string) {
		super(`RPC call to '${method}' failed: ${remoteMessage}`);
		this.remoteMessage = remoteMessage;
	}
}

/** The `error` event a socket that fails to open rejects `start()` with. */
export function socketError(): { readonly type: "error" } {
	return { type: "error" };
}

/** How the next `start()` of an instance ends. */
export type StartOutcome =
	| "open"
	/** Waits for `settleStart()`. */
	| "wait"
	| { readonly reject: unknown };

/** One request the connector sent through an instance. */
export interface FakeRequest {
	readonly method: "getBalances" | "getTokens" | "executeAction";
	readonly action: string | undefined;
	readonly params: SdkWireValues | undefined;
	readonly options: SdkRequestOptions;
	/** Whether the request's signal aborted, which makes the SDK publish a cancel. */
	readonly cancelled: boolean;
	resolve(result: unknown): void;
	reject(reason: unknown): void;
}

type Listener = (payload: never) => void;

/** The relay client of one instance. The test moves its socket up and down. */
export class FakeNostrClient implements SdkNostrClient {
	connected = false;
	readonly listeners = new Set<() => void>();
	readonly calls: string[] = [];

	async start(): Promise<void> {
		this.calls.push("start");
	}

	isConnected(): boolean {
		return this.connected;
	}

	onConnected(callback: () => void): () => void {
		this.listeners.add(callback);
		if (this.connected) callback();
		return () => this.listeners.delete(callback);
	}

	async ping(): Promise<void> {
		this.calls.push("ping");
	}

	disconnect(): void {
		this.calls.push("disconnect");
	}
}

/**
 * A `Dapp` whose relay and wallet side the test scripts. It reads and writes
 * its store when the SDK does, emits its events synchronously, and records
 * every call the connector makes.
 */
export class FakeDapp implements SdkDapp {
	readonly options: SdkDappOptions;
	readonly client = new FakeNostrClient();
	/** The connector's calls, in order. */
	readonly calls: string[] = [];
	readonly requests: FakeRequest[] = [];
	/** The options of every `pair()`. */
	readonly pairOptions: { signal?: AbortSignal }[] = [];
	/** The reason of every `forgetSession()`. */
	readonly forgets: (string | undefined)[] = [];
	readonly listeners = new Map<string, Set<Listener>>();
	/** When set, `stop()` rejects with it. */
	stopError: unknown;
	/** When set, `forgetSession()` rejects with it. */
	forgetError: unknown;
	/** How many times the connection policy was torn down. */
	policyTeardowns = 0;

	private readonly privateKeyHex: string;
	private readonly startOutcome: StartOutcome;
	private releaseStart: (reason?: { readonly reject: unknown }) => void =
		() => {};
	private started = false;
	private policyApplied = false;
	private teardown: (() => void) | undefined;
	private pairing: SdkDappSession | undefined;
	private reachable = false;
	private lastEventTimestamp: number | undefined;
	private pendingPairing:
		| {
				resolve(session: SdkDappSession): void;
				reject(reason: unknown): void;
		  }
		| undefined;

	constructor(options: SdkDappOptions) {
		this.options = options;
		// The SDK writes its default relay into the options it is given.
		Object.assign(options, { relayUrl: RELAY });
		fakeSdk.dapps.push(this);
		this.privateKeyHex = fakeSdk.dapps.length.toString(16).padStart(64, "0");
		this.startOutcome = fakeSdk.startOutcome(options.sessionKey);
	}

	/** Whether `pair()` is waiting for the wallet. */
	get pairingPending(): boolean {
		return this.pendingPairing !== undefined;
	}

	async start(): Promise<void> {
		this.calls.push("start");
		const { store, sessionKey } = this.options;
		const saved = await store.get(sessionKey);
		this.pairing =
			saved === undefined
				? undefined
				: {
						walletPubkey: saved.walletPubkey,
						allowedTokens: saved.allowedTokens,
					};
		this.lastEventTimestamp = saved?.lastEventTimestamp;
		if (saved === undefined) await this.persist();

		// The policy is applied once, before the socket exists.
		if (!this.policyApplied) {
			this.policyApplied = true;
			const teardown = this.options.connectionPolicy(this.client);
			this.teardown = typeof teardown === "function" ? teardown : undefined;
		}
		if (this.startOutcome === "wait") {
			const failure = await new Promise<
				{ readonly reject: unknown } | undefined
			>((resolve) => {
				this.releaseStart = resolve;
			});
			if (failure !== undefined) throw failure.reject;
		} else if (this.startOutcome !== "open") {
			throw this.startOutcome.reject;
		}
		this.openSocket();
		this.started = true;

		if (this.pairing !== undefined) {
			this.emit("sessionEstablished", {
				session: this.pairing,
				restored: true,
			});
		}
	}

	/** Ends a `start()` that waits: the socket opens, or fails with `failure`. */
	settleStart(failure?: { readonly reject: unknown }): void {
		this.releaseStart(failure);
	}

	async stop(): Promise<void> {
		this.calls.push("stop");
		this.setReachable(false);
		this.started = false;
		if (this.teardown !== undefined) this.policyTeardowns += 1;
		this.teardown?.();
		this.teardown = undefined;
		this.policyApplied = false;
		this.client.listeners.clear();
		this.client.connected = false;
		if (this.stopError !== undefined) throw this.stopError;
	}

	createInviteUrl(): string {
		this.calls.push("createInviteUrl");
		this.requireStarted();
		return inviteOf(this);
	}

	pair(opts: { signal?: AbortSignal }): Promise<SdkDappSession> {
		this.calls.push("pair");
		this.pairOptions.push(opts);
		this.requireStarted();
		if (this.pairing !== undefined) return Promise.resolve(this.pairing);
		// As in the SDK, a signal that is already aborted is not noticed.
		return new Promise((resolve, reject) => {
			const settle = (run: () => void) => {
				this.pendingPairing = undefined;
				run();
			};
			opts.signal?.addEventListener(
				"abort",
				() => settle(() => reject(new ErrorUserRejected("Pairing cancelled"))),
				{ once: true },
			);
			this.pendingPairing = {
				resolve: (session) => settle(() => resolve(session)),
				reject: (reason) => settle(() => reject(reason)),
			};
		});
	}

	async forgetSession(reason?: string): Promise<void> {
		this.calls.push("forgetSession");
		this.requireStarted();
		this.forgets.push(reason);
		if (this.forgetError !== undefined) throw this.forgetError;
		await this.clearSession();
	}

	isSessionActive(): boolean {
		return this.pairing !== undefined;
	}

	isWalletReachable(): boolean {
		return this.reachable;
	}

	getBalances(
		opts: SdkRequestOptions,
	): Promise<Readonly<Record<string, bigint>>> {
		return this.send("getBalances", undefined, undefined, opts);
	}

	getTokens(opts: SdkRequestOptions): Promise<unknown[]> {
		return this.send("getTokens", undefined, undefined, opts);
	}

	executeAction(
		action: string,
		params: SdkWireValues,
		opts: SdkRequestOptions,
	): Promise<SdkActionResponse> {
		return this.send("executeAction", action, params, opts);
	}

	on<E extends keyof SdkDappEvents>(
		event: E,
		listener: (payload: SdkDappEvents[E]) => void,
	): () => void {
		const set = this.listeners.get(event) ?? new Set();
		set.add(listener);
		this.listeners.set(event, set);
		return () => this.off(event, listener);
	}

	off<E extends keyof SdkDappEvents>(
		event: E,
		listener: (payload: SdkDappEvents[E]) => void,
	): void {
		this.listeners.get(event)?.delete(listener);
	}

	/** How many event listeners the connector holds on this instance. */
	listenerCount(): number {
		return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
	}

	/**
	 * The wallet's `sessionCreate` arrives. As in the SDK, the pairing is set
	 * and written before `pair()` resolves, and the handler fails when no
	 * pairing is waiting by then.
	 */
	async approve(
		walletPubkey: string = WALLET,
		allowedTokens: string[] = [...this.options.allowedTokens],
	): Promise<void> {
		if (this.pendingPairing === undefined) {
			throw new Error(
				"No pairing in progress - this creation is stale or already resolved",
			);
		}
		this.pairing = { walletPubkey, allowedTokens };
		await this.persist();
		if (this.pendingPairing === undefined) {
			throw new TypeError("Cannot read properties of null");
		}
		this.pendingPairing.resolve(this.pairing);
		this.emit("sessionEstablished", { session: this.pairing, restored: false });
	}

	/** `pair()` rejects with `reason`. */
	rejectPairing(reason: unknown): void {
		this.pendingPairing?.reject(reason);
	}

	/** The wallet's `sessionDelete` arrives. */
	async deleteSession(): Promise<void> {
		await this.clearSession();
	}

	/** An event arrives that advances the timestamp: the SDK writes, unawaited. */
	receiveEvent(): void {
		this.lastEventTimestamp = (this.lastEventTimestamp ?? 1_731_800_000) + 10;
		void this.persist();
	}

	/** A liveness ping is answered, or not. Emits on a transition only. */
	setReachable(reachable: boolean): void {
		if (this.reachable === reachable) return;
		this.reachable = reachable;
		this.emit("walletReachabilityChanged", reachable);
	}

	/** The relay socket opens. */
	openSocket(): void {
		this.client.connected = true;
		for (const listener of [...this.client.listeners]) listener();
	}

	/** The relay socket drops; nothing is emitted, as in the SDK. */
	dropSocket(): void {
		this.client.connected = false;
	}

	/** Emits an SDK event to the connector's listeners, synchronously. */
	emit<E extends keyof SdkDappEvents>(
		event: E,
		payload: SdkDappEvents[E],
	): void {
		for (const listener of [...(this.listeners.get(event) ?? [])]) {
			(listener as (payload: SdkDappEvents[E]) => void)(payload);
		}
	}

	private requireStarted(): void {
		if (!this.started) throw new Error("Dapp.start() must be called first.");
	}

	private persist(): Promise<void> {
		return this.options.store.set(this.options.sessionKey, {
			privateKeyHex: this.privateKeyHex,
			walletPubkey: this.pairing?.walletPubkey,
			allowedTokens: this.pairing?.allowedTokens,
			lastEventTimestamp: this.started ? this.lastEventTimestamp : undefined,
		});
	}

	private async clearSession(): Promise<void> {
		this.setReachable(false);
		this.pairing = undefined;
		await this.persist();
		this.emit("sessionDeleted", undefined);
	}

	private async send<R>(
		method: FakeRequest["method"],
		action: string | undefined,
		params: SdkWireValues | undefined,
		options: SdkRequestOptions,
	): Promise<R> {
		this.calls.push(method);
		this.requireStarted();
		if (this.pairing === undefined) {
			throw new Error(
				"Not paired with a wallet yet - call start() then pair() first.",
			);
		}
		return new Promise<R>((resolve, reject) => {
			let cancelled = false;
			options.signal?.addEventListener(
				"abort",
				() => {
					cancelled = true;
					reject(
						method === "executeAction"
							? new ErrorUserRejected()
							: new Error(`RPC call to '${method}' was aborted`),
					);
				},
				{ once: true },
			);
			this.requests.push({
				method,
				action,
				params,
				options,
				get cancelled() {
					return cancelled;
				},
				resolve: (result) => resolve(result as R),
				reject,
			});
		});
	}
}

/** The invite an instance hands out: its own key and the relay, as the SDK builds it. */
export function inviteOf(dapp: FakeDapp): string {
	const key = (fakeSdk.dapps.indexOf(dapp) + 1).toString(16).padStart(64, "a");
	return `bch-cc-v1:${key}?relay=${encodeURIComponent(RELAY)}`;
}

/**
 * What the mocked SDK modules do. Tests reset it in `beforeEach`.
 */
export interface FakeSdk {
	/** Every instance the connector built, in order. */
	readonly dapps: FakeDapp[];
	/** The relay clients the heartbeat policy was run on. */
	readonly heartbeats: SdkNostrClient[];
	/** How many times a heartbeat was torn down. */
	heartbeatStops: number;
	/** How `start()` ends for the instance built with this `sessionKey`. */
	startOutcome(sessionKey: string): StartOutcome;
}

/** Shared state of the mocked modules. */
export const fakeSdk: FakeSdk = {
	dapps: [],
	heartbeats: [],
	heartbeatStops: 0,
	startOutcome: () => "open",
};

/** Restores {@link fakeSdk} to no instances and no recorded calls. */
export function resetFakeSdk(): void {
	fakeSdk.dapps.length = 0;
	fakeSdk.heartbeats.length = 0;
	fakeSdk.heartbeatStops = 0;
	fakeSdk.startOutcome = () => "open";
}

const dappClass: SdkDappClass = FakeDapp;

const nostrClientClass: SdkNostrClientClass = {
	// biome-ignore lint/style/useNamingConvention: SDK method name.
	SmartHeartbeat(): SdkConnectionPolicy {
		return (client) => {
			fakeSdk.heartbeats.push(client);
			return () => {
				fakeSdk.heartbeatStops += 1;
			};
		};
	},
};

/** The mocked `@cashconnect-js/nostr/dapp`. */
export const dappModule: {
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	readonly Dapp: SdkDappClass;
} = {
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	Dapp: dappClass,
};

/** The mocked `@cashconnect-js/nostr`. */
export const nostrModule: {
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	readonly NostrClient: SdkNostrClientClass;
} = {
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	NostrClient: nostrClientClass,
};
