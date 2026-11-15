import { createClient, memory, type Session } from "@bchconnect/core";
import type * as Sdk from "@walletconnect/sign-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { walletConnect } from "../../src/connector.js";
import type { WalletConnect } from "../../src/types.js";
import { type Relay, startRelay } from "./relay.js";
import {
	approvedNamespaces,
	memoryStorage,
	type ReceivedRequest,
	type SdkStorage,
	secondAccount,
	startWallet,
	type Wallet,
	walletAccount,
	walletMetadata,
} from "./wallet.js";

const dapp = vi.hoisted(() => {
	let storage: SdkStorage | undefined;
	return {
		/** Closes the relay connection of the sign client the dapp started last. */
		closeRelay: async (): Promise<void> => {},
		set(next: SdkStorage) {
			storage = next;
		},
		storage(): SdkStorage {
			if (storage === undefined) throw new Error("No dapp storage");
			return storage;
		},
	};
});

// The connector lets the SDK pick its storage, a file in the working directory under Node; the dapp's state stays in memory here.
vi.mock("@walletconnect/sign-client", async (importOriginal) => {
	const real = await importOriginal<typeof Sdk>();
	return {
		...real,
		// biome-ignore lint/style/useNamingConvention: the SDK's export name.
		SignClient: {
			init: async (options: Parameters<typeof real.SignClient.init>[0]) => {
				const client = await real.SignClient.init({
					...options,
					storage: dapp.storage(),
					logger: "silent",
				});
				dapp.closeRelay = () => client.core.relayer.transportClose();
				return client;
			},
		},
	};
});

const chain = "bch:bchtest";
const address = walletAccount.slice("bch:".length);
const userRejected = { code: 5000, message: "User rejected." };
const signed = { signedTransaction: "0200ab", signedTransactionHash: "ab12" };
const signRequest = {
	transaction: "0200",
	sourceOutputs: [
		{
			outpointIndex: 0,
			outpointTransactionHash: Uint8Array.of(0xab, 0xcd),
			sequenceNumber: 0,
			unlockingBytecode: Uint8Array.of(),
			lockingBytecode: Uint8Array.of(0x76, 0xa9),
			valueSatoshis: 1000n,
		},
	],
	broadcast: false,
};

let relay: Relay;
let wallet: Wallet;
const disposers: (() => Promise<void>)[] = [];

function newClient() {
	const client = createClient({
		connectors: [
			walletConnect({ projectId: "0".repeat(32), relayUrl: relay.url }),
		],
		network: "chipnet",
		appMetadata: { name: "Demo dapp", url: "https://dapp.example" },
		storage: memory(),
	});
	disposers.push(() => client.dispose());
	return client;
}

type Client = ReturnType<typeof newClient>;

/** Returns `promise`, marked as handled until a test asserts on it. */
function later<T>(promise: Promise<T>): Promise<T> {
	promise.catch(() => {});
	return promise;
}

/** Waits for a condition the SDKs reach over the relay. */
function until(assertion: () => void): Promise<void> {
	return vi.waitFor(assertion, { timeout: 5000, interval: 10 });
}

interface Pairing {
	readonly uri: string;
	readonly result: Promise<Session<WalletConnect>>;
}

/** Starts `connect()` and waits for its pairing URI. */
async function startPairing(
	client: Client,
	signal?: AbortSignal,
): Promise<Pairing> {
	let uri: string | undefined;
	const result = later(
		client.connect("bch-wc2", {
			...(signal === undefined ? {} : { signal }),
			onPairing: (pairing) => {
				if (pairing.kind === "uri") uri = pairing.uri;
			},
		}),
	);
	await until(() => expect(uri).toBeDefined());
	return { uri: uri ?? "", result };
}

/** Pairs the wallet with `uri` and waits for the dapp's proposal. */
async function receiveProposal(uri: string): Promise<number> {
	const before = wallet.proposals.length;
	await wallet.sdk.pair({ uri });
	await until(() => expect(wallet.proposals).toHaveLength(before + 1));
	return wallet.proposals.at(-1)?.id ?? -1;
}

/** Connects `client` to the wallet, which approves `namespaces`. */
async function connect(
	client: Client,
	namespaces = approvedNamespaces(),
): Promise<Session<WalletConnect>> {
	const { uri, result } = await startPairing(client);
	const id = await receiveProposal(uri);
	const { acknowledged } = await wallet.sdk.approve({ id, namespaces });
	const session = await result;
	await acknowledged();
	return session;
}

/** Waits for the wallet's next request. */
async function nextRequest(): Promise<ReceivedRequest> {
	const before = wallet.requests.length;
	await until(() => expect(wallet.requests).toHaveLength(before + 1));
	const request = wallet.requests.at(-1);
	if (request === undefined) throw new Error("No request");
	return request;
}

function answer(request: ReceivedRequest, result: unknown): Promise<void> {
	return wallet.sdk.respond({
		topic: request.topic,
		response: { id: request.id, jsonrpc: "2.0", result },
	});
}

function decline(
	request: ReceivedRequest,
	error: { code: number; message: string },
): Promise<void> {
	return wallet.sdk.respond({
		topic: request.topic,
		response: { id: request.id, jsonrpc: "2.0", error },
	});
}

function pendingMethods(): string[] {
	return wallet.sdk
		.getPendingSessionRequests()
		.map(({ params }) => params.request.method);
}

function requestsPublishedOn(topic: string): number {
	// Tag of a session request on the relay.
	return relay.published.filter((m) => m.topic === topic && m.tag === 1108)
		.length;
}

beforeEach(async () => {
	// Each sign client gets its own core instead of the one shared through `globalThis`.
	vi.stubEnv("DISABLE_GLOBAL_CORE", "true");
	dapp.set(memoryStorage());
	relay = await startRelay();
	wallet = await startWallet(relay.url);
});

afterEach(async () => {
	for (const dispose of disposers.splice(0)) await dispose();
	await wallet.close();
	await relay.close();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("pairing", () => {
	it("should propose the bch namespace and adopt the approved session", async () => {
		const client = newClient();
		await client.init();

		const { uri, result } = await startPairing(client);
		const id = await receiveProposal(uri);
		expect(wallet.proposals[0]).toEqual({
			id,
			requiredNamespaces: {},
			optionalNamespaces: {
				bch: {
					chains: [chain],
					methods: [
						"bch_getAddresses",
						"bch_signTransaction",
						"bch_signMessage",
					],
					events: ["addressesChanged"],
				},
			},
		});
		const { topic, acknowledged } = await wallet.sdk.approve({
			id,
			namespaces: approvedNamespaces(),
		});
		const session = await result;
		await acknowledged();

		expect(session).toEqual({
			id: topic,
			protocol: "bch-wc2",
			wallet: {
				name: walletMetadata.name,
				icon: walletMetadata.icons[0],
				source: "protocol",
			},
			data: {
				chain,
				addresses: [address],
				methods: ["bch_getAddresses", "bch_signTransaction", "bch_signMessage"],
			},
			status: { transport: "connected", peer: "unknown" },
		});
		expect(client.sessions.get(topic)).toEqual(session);
	});

	it("should reject REJECTED by an unknown party when the wallet declines the proposal", async () => {
		const client = newClient();
		await client.init();

		const { uri, result } = await startPairing(client);
		const id = await receiveProposal(uri);
		await wallet.sdk.reject({ id, reason: userRejected });

		await expect(result).rejects.toMatchObject({
			code: "REJECTED",
			by: "unknown",
		});
		expect(client.sessions.size).toBe(0);
	});

	it("should leave no session on either side when the caller aborts before the wallet approves", async () => {
		const client = newClient();
		await client.init();
		const controller = new AbortController();

		const { uri, result } = await startPairing(client, controller.signal);
		const id = await receiveProposal(uri);
		const pairingTopic = uri.slice("wc:".length, uri.indexOf("@"));
		controller.abort();
		await expect(result).rejects.toMatchObject({ code: "ABORTED" });
		await until(() =>
			expect(
				wallet.sdk.core.pairing
					.getPairings()
					.some((pairing) => pairing.topic === pairingTopic),
			).toBe(false),
		);

		await expect(
			wallet.sdk.approve({ id, namespaces: approvedNamespaces() }),
		).rejects.toThrow();
		expect(wallet.sdk.session.getAll()).toEqual([]);
		expect(client.sessions.size).toBe(0);
	});
});

describe("requests", () => {
	it("should read the wallet's addresses", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);

		const reading = client.request(session, "bch_getAddresses", undefined);
		const request = await nextRequest();
		expect(request).toMatchObject({
			topic: session.id,
			chainId: chain,
			method: "bch_getAddresses",
			params: {},
		});
		await answer(request, [address]);

		await expect(reading).resolves.toEqual([address]);
	});

	it("should sign a message through the message-signing capability", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);

		const signing = client
			.capability(session, "message-signing")
			?.signMessage({ message: "hi" });
		const request = await nextRequest();
		expect(request).toMatchObject({
			method: "bch_signMessage",
			params: { message: "hi" },
		});
		await answer(request, "H/signature==");

		await expect(signing).resolves.toBe("H/signature==");
	});

	it("should send a transaction to sign in extended JSON with the longest expiry", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);

		const sentAt = Date.now() / 1000;
		const signing = client
			.capability(session, "libauth-signing")
			?.signTransaction(signRequest);
		const request = await nextRequest();
		expect(request).toMatchObject({
			method: "bch_signTransaction",
			params: {
				transaction: "0200",
				sourceOutputs: [
					{
						outpointIndex: 0,
						outpointTransactionHash: "<Uint8Array: 0xabcd>",
						sequenceNumber: 0,
						unlockingBytecode: "<Uint8Array: 0x>",
						lockingBytecode: "<Uint8Array: 0x76a9>",
						valueSatoshis: "<bigint: 1000n>",
					},
				],
				broadcast: false,
			},
		});
		expect(request.expiryTimestamp).toBeGreaterThanOrEqual(
			Math.floor(sentAt) + 604_800 - 5,
		);
		expect(request.expiryTimestamp).toBeLessThanOrEqual(
			Math.ceil(Date.now() / 1000) + 604_800 + 5,
		);
		await answer(request, signed);

		await expect(signing).resolves.toEqual(signed);
	});

	it("should reject REJECTED by the user when the wallet declines with code 5000", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);

		const signing = later(
			client.request(session, "bch_signMessage", { message: "hi" }),
		);
		await decline(await nextRequest(), userRejected);

		await expect(signing).rejects.toMatchObject({
			code: "REJECTED",
			by: "user",
			remoteMessage: "User rejected.",
			sessionId: session.id,
		});
	});

	it("should reject REJECTED by the wallet when the wallet declines with another code", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);

		const signing = later(
			client.request(session, "bch_signTransaction", signRequest),
		);
		await decline(await nextRequest(), {
			code: 7,
			message: "Transaction signing request aborted",
		});

		await expect(signing).rejects.toMatchObject({
			code: "REJECTED",
			by: "wallet",
			remoteMessage: "Transaction signing request aborted",
		});
	});

	it("should reject INVALID_WALLET_RESPONSE when the wallet answers a sign request with an empty object", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);

		const signing = later(
			client.request(session, "bch_signTransaction", signRequest),
		);
		await answer(await nextRequest(), {});

		await expect(signing).rejects.toMatchObject({
			code: "INVALID_WALLET_RESPONSE",
		});
	});

	it("should refuse a method the wallet did not approve without sending it", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(
			client,
			approvedNamespaces({ methods: ["bch_getAddresses"] }),
		);

		expect(client.can(session, "message-signing")).toBe(false);
		expect(client.can(session, "libauth-signing")).toBe(false);
		await expect(
			client.request(session, "bch_signMessage", { message: "hi" }),
		).rejects.toMatchObject({ code: "METHOD_UNSUPPORTED" });

		// A request sent afterwards is the first one the wallet sees.
		const reading = client.request(session, "bch_getAddresses", undefined);
		const request = await nextRequest();
		expect(request.method).toBe("bch_getAddresses");
		expect(requestsPublishedOn(session.id)).toBe(1);
		await answer(request, [address]);
		await expect(reading).resolves.toEqual([address]);
	});

	it("should cancel an aborted request when the wallet advertises cancelling", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(
			client,
			approvedNamespaces({
				methods: [
					"bch_getAddresses",
					"bch_signTransaction",
					"bch_signMessage",
					"bch_cancelPendingRequests",
				],
			}),
		);
		const controller = new AbortController();

		const signing = later(
			client.request(
				session,
				"bch_signMessage",
				{ message: "hi" },
				{ signal: controller.signal },
			),
		);
		await nextRequest();
		controller.abort();

		await expect(signing).rejects.toMatchObject({ code: "ABORTED" });
		await until(() =>
			expect(pendingMethods()).toEqual([
				"bch_signMessage",
				"bch_cancelPendingRequests",
			]),
		);
		const cancel = wallet.sdk.getPendingSessionRequests()[1];
		expect(cancel?.params.request.params).toEqual({});
	});

	it("should send nothing after an aborted request when the wallet does not advertise cancelling", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);
		const controller = new AbortController();

		const signing = later(
			client.request(
				session,
				"bch_signMessage",
				{ message: "hi" },
				{ signal: controller.signal },
			),
		);
		await nextRequest();
		controller.abort();
		await expect(signing).rejects.toMatchObject({ code: "ABORTED" });

		// A request sent after the abort shows that nothing went out in between.
		later(client.request(session, "bch_getAddresses", undefined));
		await until(() =>
			expect(pendingMethods()).toEqual(["bch_signMessage", "bch_getAddresses"]),
		);
		expect(requestsPublishedOn(session.id)).toBe(2);
	});
});

describe("session events", () => {
	it("should end the session and its pending request when the wallet disconnects", async () => {
		const client = newClient();
		const disconnected = vi.fn();
		client.on("session:disconnected", disconnected);
		await client.init();
		const session = await connect(client);

		const reading = later(
			client.request(session, "bch_getAddresses", undefined),
		);
		await nextRequest();
		await wallet.sdk.disconnect({
			topic: session.id,
			reason: { code: 6000, message: "User disconnected." },
		});

		await expect(reading).rejects.toMatchObject({
			code: "SESSION_MISSING",
			sessionId: session.id,
		});
		expect(disconnected).toHaveBeenCalledWith({
			sessionId: session.id,
			reason: "wallet",
		});
		expect(client.sessions.size).toBe(0);
	});

	it("should follow a wallet's update to its accounts", async () => {
		const client = newClient();
		const changed = vi.fn();
		client.on("session:changed", changed);
		await client.init();
		const session = await connect(client);

		const { acknowledged } = await wallet.sdk.update({
			topic: session.id,
			namespaces: approvedNamespaces({
				accounts: [walletAccount, secondAccount],
			}),
		});
		await acknowledged();

		await until(() =>
			expect(client.sessions.get(session.id)?.data.addresses).toEqual([
				address,
				secondAccount.slice("bch:".length),
			]),
		);
		expect(changed).toHaveBeenCalledWith(
			expect.objectContaining({
				previous: expect.objectContaining({ id: session.id }),
				session: expect.objectContaining({
					data: expect.objectContaining({
						addresses: [address, secondAccount.slice("bch:".length)],
					}),
				}),
			}),
		);
	});

	it("should end the session in the wallet when the dapp disconnects", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);

		await client.disconnect(session);

		expect(client.sessions.size).toBe(0);
		await until(() => expect(wallet.deleted).toEqual([session.id]));
		expect(wallet.sdk.session.getAll()).toEqual([]);
	});

	it("should follow the relay connection in the session status", async () => {
		const client = newClient();
		await client.init();
		const session = await connect(client);

		relay.dropAll();

		await until(() =>
			expect(client.sessions.get(session.id)?.status.transport).toBe(
				"reconnecting",
			),
		);
		await until(() =>
			expect(client.sessions.get(session.id)?.status.transport).toBe(
				"connected",
			),
		);
	});
});

describe("restore", () => {
	/** Gives core a page `localStorage`, where it keeps connector records across clients. */
	function stubLocalStorage(): Map<string, string> {
		const items = new Map<string, string>();
		vi.stubGlobal("window", {
			localStorage: {
				getItem: (key: string) => items.get(key) ?? null,
				setItem: (key: string, value: string) => items.set(key, value),
				removeItem: (key: string) => items.delete(key),
			},
		});
		return items;
	}

	/** Disposes `client` and closes its relay connection, as when the page closes. */
	async function close(client: Client, topic: string): Promise<void> {
		await client.dispose();
		await dapp.closeRelay();
		await until(() => expect(relay.subscribers(topic)).toBe(1));
	}

	it("should restore a session after a reload and serve requests over it", async () => {
		stubLocalStorage();
		const first = newClient();
		await first.init();
		const session = await connect(first);
		await close(first, session.id);

		const second = newClient();
		await second.init();

		expect(second.sessions.get(session.id)).toMatchObject({
			id: session.id,
			data: session.data,
			wallet: session.wallet,
		});
		await until(() =>
			expect(second.sessions.get(session.id)?.status.transport).toBe(
				"connected",
			),
		);
		const restored = second.session("bch-wc2");
		if (restored === null) throw new Error("No restored session");
		const reading = second.request(restored, "bch_getAddresses", undefined);
		await answer(await nextRequest(), [address]);
		await expect(reading).resolves.toEqual([address]);
	});

	// The SDK learns of the end only once its socket is up, after restoring the session from storage.
	it("should end a restored session the wallet ended while the dapp was closed", async () => {
		const items = stubLocalStorage();
		const first = newClient();
		await first.init();
		const session = await connect(first);
		await close(first, session.id);
		await wallet.sdk.disconnect({
			topic: session.id,
			reason: { code: 6000, message: "User disconnected." },
		});

		const second = newClient();
		const disconnected = vi.fn();
		second.on("session:disconnected", disconnected);
		await second.init();

		await until(() =>
			expect(disconnected).toHaveBeenCalledWith({
				sessionId: session.id,
				reason: "wallet",
			}),
		);
		expect(second.sessions.size).toBe(0);
		await until(() =>
			expect(items.has("bchconnect:bch-wc2:sessions")).toBe(false),
		);
	});
});
