import type {
	SdkProposalNamespace,
	SdkRelayer,
	SdkSession,
	SdkSessionEnd,
	SdkSessionEvent,
	SdkSessionUpdate,
	SdkSignClient,
	SdkSignClientFactory,
	SdkSignClientOptions,
} from "../../src/sdk.js";

/** A chipnet address as wallets list it in a session account. */
export const address = "bchtest:qzj7djuuexampleaddress0000000000000000";

/** Every method the connector proposes. */
export const proposedMethods: string[] = [
	"bch_getAddresses",
	"bch_signTransaction",
	"bch_signMessage",
];

/** What {@link sdkSession} can override. */
export interface SdkSessionInit {
	topic?: string;
	expiry?: number;
	accounts?: unknown;
	methods?: unknown;
	namespaces?: Record<string, unknown>;
	name?: unknown;
	icons?: unknown;
}

/** A chipnet session as the SDK stores it, valid unless overridden. */
export function sdkSession(init: SdkSessionInit = {}): SdkSession {
	return {
		topic: init.topic ?? "topic-1",
		expiry: init.expiry ?? Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
		namespaces: init.namespaces ?? {
			bch: {
				chains: ["bch:bchtest"],
				accounts: init.accounts ?? [`bch:${address}`],
				methods: init.methods ?? proposedMethods,
				events: ["addressesChanged"],
			},
		},
		peer: {
			metadata: {
				name: "name" in init ? init.name : "Cashonize",
				icons:
					"icons" in init ? init.icons : ["https://cashonize.com/icon.png"],
			},
		},
	};
}

/** A pairing URI carrying a secret key, as the SDK builds it. */
export function pairingUri(pairingTopic: string): string {
	return `wc:${pairingTopic}@2?relay-protocol=irn&symKey=secret0123456789abcdef`;
}

/** A proposal the test settles on the wallet's behalf. */
export interface FakeProposal {
	readonly optionalNamespaces: Record<string, SdkProposalNamespace>;
	readonly uri: string;
	readonly pairingTopic: string;
	/** Whether the connector called `approval()`. */
	readonly approvalCalled: boolean;
	/** The wallet approves. Lost, as in the SDK, unless `approval()` ran first. */
	approve(session: SdkSession): void;
	/** The wallet rejects. Lost, as in the SDK, unless `approval()` ran first. */
	reject(reason: unknown): void;
}

/** One request the connector sent. */
export interface FakeRequest {
	readonly topic: string;
	readonly chainId: string;
	readonly method: string;
	readonly params: unknown;
	readonly expiry: number | undefined;
	resolve(result: unknown): void;
	reject(reason: unknown): void;
}

type Listener = (args: never) => void;

class FakeRelayer implements SdkRelayer {
	connected = false;
	readonly listeners = new Map<string, Set<() => void>>();

	on(event: string, listener: () => void): void {
		const set = this.listeners.get(event) ?? new Set();
		set.add(listener);
		this.listeners.set(event, set);
	}

	off(event: string, listener: () => void): void {
		this.listeners.get(event)?.delete(listener);
	}

	/** Fires a relay event, updating `connected` first, as the SDK does. */
	fire(event: "relayer_connect" | "relayer_disconnect"): void {
		this.connected = event === "relayer_connect";
		for (const listener of [...(this.listeners.get(event) ?? [])]) listener();
	}
}

/**
 * A sign client whose wallet side the test scripts. Records every call the
 * connector makes.
 */
export class FakeSignClient implements SdkSignClient {
	readonly proposals: FakeProposal[] = [];
	readonly requests: FakeRequest[] = [];
	readonly disconnects: { topic: string; reason: unknown }[] = [];
	readonly pairingDisconnects: string[] = [];
	readonly stored = new Map<string, SdkSession>();
	readonly listeners = new Map<string, Set<Listener>>();
	readonly relayer = new FakeRelayer();
	/** When set, `connect()` rejects with it. */
	connectError: unknown;
	/** When set, `disconnect()` rejects with it. */
	disconnectError: unknown;
	/** When set, `core.pairing.disconnect()` rejects with it. */
	pairingDisconnectError: unknown;

	readonly core: SdkSignClient["core"];
	readonly session: SdkSignClient["session"];

	constructor() {
		this.core = {
			relayer: this.relayer,
			pairing: {
				disconnect: async ({ topic }) => {
					this.pairingDisconnects.push(topic);
					if (this.pairingDisconnectError !== undefined)
						throw this.pairingDisconnectError;
				},
			},
		};
		this.session = { getAll: () => [...this.stored.values()] };
	}

	async connect(params: {
		optionalNamespaces: Record<string, SdkProposalNamespace>;
	}): Promise<{ uri: string; approval(): Promise<SdkSession> }> {
		if (this.connectError !== undefined) throw this.connectError;

		const pairingTopic = `pairing-${this.proposals.length + 1}`;
		let resolve: (session: SdkSession) => void = () => {};
		let reject: (reason: unknown) => void = () => {};
		const answer = new Promise<SdkSession>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		let approvalCalled = false;
		const proposal: FakeProposal = {
			optionalNamespaces: params.optionalNamespaces,
			uri: pairingUri(pairingTopic),
			pairingTopic,
			get approvalCalled() {
				return approvalCalled;
			},
			approve: (session) => {
				if (!approvalCalled) return;
				this.stored.set(session.topic, session);
				resolve(session);
			},
			reject: (reason) => {
				if (approvalCalled) reject(reason);
			},
		};
		this.proposals.push(proposal);

		return {
			uri: proposal.uri,
			approval: () => {
				approvalCalled = true;
				return answer;
			},
		};
	}

	request(params: {
		topic: string;
		chainId: string;
		request: { method: string; params: unknown };
		expiry?: number;
	}): Promise<unknown> {
		return new Promise((resolve, reject) => {
			this.requests.push({
				topic: params.topic,
				chainId: params.chainId,
				method: params.request.method,
				params: params.request.params,
				expiry: params.expiry,
				resolve,
				reject,
			});
		});
	}

	async disconnect(params: {
		topic: string;
		reason: { code: number; message: string };
	}): Promise<void> {
		this.disconnects.push(params);
		if (this.disconnectError !== undefined) throw this.disconnectError;
		this.stored.delete(params.topic);
	}

	on(event: "session_update", listener: (args: SdkSessionUpdate) => void): this;
	on(event: "session_delete", listener: (args: SdkSessionEnd) => void): this;
	on(event: "session_expire", listener: (args: SdkSessionEnd) => void): this;
	on(event: "session_event", listener: (args: SdkSessionEvent) => void): this;
	on(event: string, listener: Listener): this {
		const set = this.listeners.get(event) ?? new Set();
		set.add(listener);
		this.listeners.set(event, set);
		return this;
	}

	off(
		event: "session_update",
		listener: (args: SdkSessionUpdate) => void,
	): this;
	off(event: "session_delete", listener: (args: SdkSessionEnd) => void): this;
	off(event: "session_expire", listener: (args: SdkSessionEnd) => void): this;
	off(event: "session_event", listener: (args: SdkSessionEvent) => void): this;
	off(event: string, listener: Listener): this {
		this.listeners.get(event)?.delete(listener);
		return this;
	}

	/** Fires an SDK event to the connector's listeners. */
	fire(event: "session_update", args: SdkSessionUpdate): void;
	fire(event: "session_delete" | "session_expire", args: SdkSessionEnd): void;
	fire(event: "session_event", args: SdkSessionEvent): void;
	fire(event: string, args: unknown): void {
		for (const listener of [...(this.listeners.get(event) ?? [])])
			(listener as (args: unknown) => void)(args);
	}

	/** How many listeners the connector holds, on the client and the relay. */
	listenerCount(): number {
		const count = (map: Map<string, Set<unknown>>) =>
			[...map.values()].reduce((sum, set) => sum + set.size, 0);
		return count(this.listeners) + count(this.relayer.listeners);
	}
}

/**
 * What the mocked `@walletconnect/sign-client` module does. Tests reset it in
 * `beforeEach`.
 */
export interface FakeSdk {
	/** How many times the module's `SignClient` was read. */
	imports: number;
	/** Options of every `SignClient.init()` call. */
	readonly inits: SdkSignClientOptions[];
	/** The client the next `init()` resolves with. */
	client: FakeSignClient;
	/** When set, `init()` rejects with it. */
	initError: unknown;
	/** When set, `init()` waits for it before resolving. */
	initGate: Promise<void> | undefined;
}

/** Shared state of the mocked module. */
export const fakeSdk: FakeSdk = {
	imports: 0,
	inits: [],
	client: new FakeSignClient(),
	initError: undefined,
	initGate: undefined,
};

/** Restores {@link fakeSdk} to a fresh client and no recorded calls. */
export function resetFakeSdk(): FakeSignClient {
	fakeSdk.imports = 0;
	fakeSdk.inits.length = 0;
	fakeSdk.client = new FakeSignClient();
	fakeSdk.initError = undefined;
	fakeSdk.initGate = undefined;
	return fakeSdk.client;
}

const factory: SdkSignClientFactory = {
	async init(options) {
		fakeSdk.inits.push(options);
		await fakeSdk.initGate;
		if (fakeSdk.initError !== undefined) throw fakeSdk.initError;
		return fakeSdk.client;
	},
};

/** The mocked module's exports. Reading `SignClient` counts as one import. */
export const signClientModule: {
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	readonly SignClient: SdkSignClientFactory;
} = {
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	get SignClient() {
		fakeSdk.imports += 1;
		return factory;
	},
};
