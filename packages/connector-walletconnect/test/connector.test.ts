import {
	AbortedError,
	type Connector,
	createClient,
	InvalidWalletResponseError,
	MethodUnsupportedError,
	memory,
	NetworkMismatchError,
	RequestRejectedError,
	SessionMissingError,
	TimeoutError,
	TransportError,
} from "@bchconnect/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { walletConnect } from "../src/connector.js";
import {
	appMetadata,
	connected,
	flush,
	harness,
	recordedTopics,
	startConnect,
} from "./fixtures/harness.js";
import { loggedText } from "./fixtures/logger.js";
import {
	address,
	fakeSdk,
	proposedMethods,
	resetFakeSdk,
	sdkSession,
} from "./fixtures/sign-client.js";

vi.mock(
	"@walletconnect/sign-client",
	async () => (await import("./fixtures/sign-client.js")).signClientModule,
);

const signRequest = {
	transaction: "0200",
	sourceOutputs: [
		{
			outpointIndex: 0,
			outpointTransactionHash: Uint8Array.of(0xab, 0xcd),
			sequenceNumber: 0,
			unlockingBytecode: Uint8Array.of(),
			lockingBytecode: Uint8Array.of(0x76, 0xa9),
			valueSatoshis: 10_000n,
		},
	],
	broadcast: false,
};
const signed = { signedTransaction: "0200ab", signedTransactionHash: "ab12" };

beforeEach(() => {
	resetFakeSdk();
});

describe("walletConnect", () => {
	it("should implement the bch-wc2 protocol", () => {
		const connector = walletConnect({ projectId: "p" });

		expect(connector.protocol).toBe("bch-wc2");
		expect(connector.methods).toEqual({
			// biome-ignore lint/style/useNamingConvention: wire method name.
			bch_signTransaction: { userInteraction: true },
			// biome-ignore lint/style/useNamingConvention: wire method name.
			bch_signMessage: { userInteraction: true },
		});
	});

	it("should hand out a no-op unsubscribe, since the protocol has no typed events", async () => {
		const h = await harness();
		const session = await connected(h);

		const unsubscribe = h.connector.subscribe(session, "x" as never, () => {});

		expect(unsubscribe()).toBeUndefined();
		expect(h.sdk.listenerCount()).toBe(6);
	});
});

describe("setup", () => {
	it("should load nothing and touch no storage", async () => {
		const storage = memory();
		const get = vi.spyOn(storage, "get");
		const set = vi.spyOn(storage, "set");

		await harness({ storage });

		expect(fakeSdk.imports).toBe(0);
		expect(get).not.toHaveBeenCalled();
		expect(set).not.toHaveBeenCalled();
	});
});

describe("connect", () => {
	it("should start the sign client once, without telemetry, with the dapp's metadata", async () => {
		const h = await harness({
			config: { relayUrl: "wss://relay.example" },
			appMetadata: {
				name: "Demo dapp",
				url: "https://dapp.example",
				icon: "https://dapp.example/icon.png",
				description: "A demo",
			},
		});

		await connected(h, sdkSession({ topic: "t1" }));
		await connected(h, sdkSession({ topic: "t2" }));

		expect(fakeSdk.imports).toBe(1);
		expect(fakeSdk.inits).toEqual([
			{
				projectId: "project-1",
				relayUrl: "wss://relay.example",
				metadata: {
					name: "Demo dapp",
					description: "A demo",
					url: "https://dapp.example",
					icons: ["https://dapp.example/icon.png"],
				},
				telemetryEnabled: false,
			},
		]);
	});

	it("should fill missing metadata and leave out an unset relay", async () => {
		const h = await harness();

		await connected(h);

		expect(fakeSdk.inits).toEqual([
			{
				projectId: "project-1",
				metadata: {
					name: "Demo dapp",
					description: "",
					url: "https://dapp.example",
					icons: [],
				},
				telemetryEnabled: false,
			},
		]);
	});

	it.each([
		["mainnet", "bch:bitcoincash"],
		["chipnet", "bch:bchtest"],
		["regtest", "bch:bchreg"],
	] as const)(
		"should propose optional namespaces only, for the %s chain",
		async (network, chain) => {
			const h = await harness({ network });

			await startConnect(h);

			expect(h.sdk.proposals[0]?.optionalNamespaces).toEqual({
				bch: {
					chains: [chain],
					methods: proposedMethods,
					events: ["addressesChanged"],
				},
			});
		},
	);

	it("should propose the configured custom methods after the standard ones", async () => {
		const h = await harness({
			config: { methods: ["bch_cancelPendingRequests"] },
		});

		await startConnect(h);

		expect(h.sdk.proposals[0]?.optionalNamespaces).toEqual({
			bch: {
				chains: ["bch:bchtest"],
				methods: [...proposedMethods, "bch_cancelPendingRequests"],
				events: ["addressesChanged"],
			},
		});
	});

	it("should listen for the answer before handing out the pairing URI", async () => {
		const h = await harness();
		let listening: boolean | undefined;

		const result = h.connector.connect({
			signal: new AbortController().signal,
			onPairing: () => {
				listening = h.sdk.proposals[0]?.approvalCalled;
			},
		});
		await vi.waitFor(() => expect(listening).toBe(true));
		h.sdk.proposals[0]?.approve(sdkSession());

		await expect(result).resolves.toMatchObject({ id: "topic-1" });
	});

	it("should hand the pairing URI to onPairing, with no separate QR form", async () => {
		const h = await harness();

		const { pairings } = await startConnect(h);

		expect(pairings).toEqual([{ kind: "uri", uri: h.sdk.proposals[0]?.uri }]);
	});

	it("should resolve with the approved session and record its topic", async () => {
		const h = await harness();

		const session = await connected(
			h,
			sdkSession({
				topic: "t1",
				accounts: [`bch:${address}`, "bch:bitcoincash:qmain"],
			}),
		);

		expect(session).toEqual({
			id: "t1",
			protocol: "bch-wc2",
			wallet: {
				name: "Cashonize",
				icon: "https://cashonize.com/icon.png",
				source: "protocol",
			},
			data: {
				chain: "bch:bchtest",
				addresses: [address],
				methods: proposedMethods,
			},
			status: { transport: "connected", peer: "unknown" },
		});
		expect(await recordedTopics(h.storage)).toEqual(["t1"]);
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should keep a session that lacks a signing method", async () => {
		const h = await harness();

		const session = await connected(
			h,
			sdkSession({ methods: ["bch_getAddresses"] }),
		);

		expect(session.data.methods).toEqual(["bch_getAddresses"]);
		expect(h.connector.capabilitiesOf(session)).toEqual(new Set());
	});

	it.each([
		[
			"no account on the chain but one on another",
			sdkSession({ topic: "bad", accounts: ["bch:bitcoincash:qmain"] }),
			NetworkMismatchError,
		],
		[
			"no usable bch namespace",
			sdkSession({ topic: "bad", namespaces: { eip155: {} } }),
			InvalidWalletResponseError,
		],
	])(
		"should reject a session with %s and disconnect it",
		async (_, raw, type) => {
			const h = await harness();

			const error = await connected(h, raw).catch((e: unknown) => e);

			expect(error).toBeInstanceOf(type);
			expect(h.sdk.disconnects).toEqual([
				{ topic: "bad", reason: { code: 6000, message: "User disconnected." } },
			]);
			expect(await recordedTopics(h.storage)).toEqual([]);
		},
	);

	it("should reject a wallet decline without blaming the user", async () => {
		const h = await harness();
		const { result } = await startConnect(h);
		const reason = { code: 5000, message: "User rejected." };

		h.sdk.proposals[0]?.reject(reason);
		const error = await result.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(RequestRejectedError);
		expect(error).toMatchObject({
			code: "REJECTED",
			by: "unknown",
			remoteMessage: "User rejected.",
			cause: reason,
		});
		expect(h.sdk.pairingDisconnects).toEqual([]);
		expect(await recordedTopics(h.storage)).toEqual([]);
	});

	it("should reject an expired proposal as a timeout", async () => {
		const h = await harness();
		const { result } = await startConnect(h);
		const reason = { message: "Proposal expired", code: 0 };

		h.sdk.proposals[0]?.reject(reason);

		await expect(result).rejects.toMatchObject({
			code: "TIMEOUT",
			cause: reason,
		});
	});

	it("should reject a failed proposal as a transport failure", async () => {
		const h = await harness();
		const reason = new Error("Relay unreachable");
		h.sdk.connectError = reason;

		const error = await h.connector
			.connect({ signal: new AbortController().signal })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({ cause: reason });
	});

	it("should reject a failed start, and start again on the next call", async () => {
		const h = await harness();
		const reason = new Error("init failed");
		fakeSdk.initError = reason;

		const error = await h.connector
			.connect({ signal: new AbortController().signal })
			.catch((e: unknown) => e);
		fakeSdk.initError = undefined;
		const session = await connected(h);

		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({
			message: "The WalletConnect client failed to start",
			cause: reason,
		});
		expect(fakeSdk.inits).toHaveLength(2);
		expect(session.id).toBe("topic-1");
	});

	it("should reject at once with an already aborted signal's reason, loading nothing", async () => {
		const h = await harness();
		const reason = new TimeoutError("connect() timed out");

		const error = await h.connector
			.connect({ signal: AbortSignal.abort(reason) })
			.catch((e: unknown) => e);

		expect(error).toBe(reason);
		expect(fakeSdk.imports).toBe(0);
	});

	it("should reject with the abort reason and delete the pairing, without awaiting the wallet", async () => {
		const h = await harness();
		const { result, controller } = await startConnect(h);
		const reason = new AbortedError("Aborted by caller");

		controller.abort(reason);

		await expect(result).rejects.toBe(reason);
		expect(h.sdk.pairingDisconnects).toEqual(["pairing-1"]);
		expect(h.sdk.disconnects).toEqual([]);
	});

	it("should wrap an abort reason that is not a library error", async () => {
		const h = await harness();
		const { result, controller } = await startConnect(h);

		controller.abort("stop");
		const error = await result.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(AbortedError);
		expect(error).toMatchObject({ cause: "stop" });
	});

	it("should disconnect a session the wallet approves after the abort", async () => {
		const h = await harness();
		const { result, controller } = await startConnect(h);
		controller.abort(new AbortedError("Aborted by caller"));
		await result.catch(() => {});

		h.sdk.proposals[0]?.approve(sdkSession({ topic: "late" }));
		await flush();

		expect(h.sdk.disconnects).toEqual([
			{ topic: "late", reason: { code: 6000, message: "User disconnected." } },
		]);
		expect(await recordedTopics(h.storage)).toEqual([]);
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should keep a failed pairing deletion away from the caller", async () => {
		const h = await harness();
		h.sdk.pairingDisconnectError = new Error("No matching key");
		const { result, controller } = await startConnect(h);
		const reason = new AbortedError("Aborted by caller");

		controller.abort(reason);
		await flush();

		await expect(result).rejects.toBe(reason);
		expect(h.logger.debug).toHaveBeenCalledWith(
			"Deleting an abandoned WalletConnect pairing failed",
			h.sdk.pairingDisconnectError,
		);
	});

	it("should abandon the pairing when onPairing throws", async () => {
		const h = await harness();
		const thrown = new Error("ui failed");
		h.sdk.relayer.connected = true;

		const error = await h.connector
			.connect({
				signal: new AbortController().signal,
				onPairing: () => {
					throw thrown;
				},
			})
			.catch((e: unknown) => e);

		expect(error).toBe(thrown);
		expect(h.sdk.pairingDisconnects).toEqual(["pairing-1"]);
	});

	it("should reject at once when aborted while the client starts, and propose nothing", async () => {
		const h = await harness();
		let open = () => {};
		fakeSdk.initGate = new Promise((resolve) => {
			open = resolve;
		});
		const controller = new AbortController();
		const result = h.connector.connect({ signal: controller.signal });
		await vi.waitFor(() => expect(fakeSdk.inits).toHaveLength(1));
		const reason = new AbortedError("Aborted by caller");

		controller.abort(reason);
		await expect(result).rejects.toBe(reason);
		open();
		await flush();

		expect(h.sdk.proposals).toEqual([]);
	});

	it("should delete a pairing whose proposal resolves after the abort", async () => {
		const h = await harness();
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const propose = h.sdk.connect.bind(h.sdk);
		vi.spyOn(h.sdk, "connect").mockImplementation(async (params) => {
			await gate;
			return propose(params);
		});
		const controller = new AbortController();
		const result = h.connector.connect({ signal: controller.signal });
		await vi.waitFor(() => expect(h.sdk.connect).toHaveBeenCalled());
		const reason = new AbortedError("Aborted by caller");

		controller.abort(reason);
		await expect(result).rejects.toBe(reason);
		release();
		await flush();

		expect(h.sdk.proposals[0]?.approvalCalled).toBe(true);
		expect(h.sdk.pairingDisconnects).toEqual(["pairing-1"]);
	});

	it("should never log the pairing URI or put it in an error", async () => {
		const h = await harness();
		h.sdk.pairingDisconnectError = new Error("No matching key");
		const errors: unknown[] = [];

		const aborted = await startConnect(h);
		aborted.controller.abort(new AbortedError("Aborted by caller"));
		errors.push(await aborted.result.catch((e: unknown) => e));
		const declined = await startConnect(h);
		h.sdk.proposals[1]?.reject({ code: 5000, message: "User rejected." });
		errors.push(await declined.result.catch((e: unknown) => e));
		const invalid = await startConnect(h);
		h.sdk.proposals[2]?.approve(sdkSession({ accounts: [] }));
		errors.push(await invalid.result.catch((e: unknown) => e));
		h.sdk.proposals[0]?.approve(sdkSession({ topic: "late" }));
		await flush();

		const uris = h.sdk.proposals.map((proposal) => proposal.uri);
		const texts = [
			...loggedText(h.logger),
			...errors.map((error) =>
				error instanceof Error
					? `${error.message} ${JSON.stringify(error)}`
					: "",
			),
		];
		expect(h.logger.debug).toHaveBeenCalled();
		for (const text of texts) {
			expect(text).not.toContain("symKey");
			for (const uri of uris) expect(text).not.toContain(uri);
		}
	});
});

describe("restore", () => {
	it("should return nothing and load nothing when no session is recorded", async () => {
		const h = await harness();

		await expect(h.connector.restore()).resolves.toEqual([]);
		expect(fakeSdk.imports).toBe(0);
	});

	it("should restore recorded sessions the SDK still holds, as reconnecting", async () => {
		const storage = memory();
		await storage.set(
			"sessions",
			JSON.stringify({ v: 1, topics: ["t1", "t2"] }),
		);
		const h = await harness({ storage });
		h.sdk.stored.set("t1", sdkSession({ topic: "t1" }));
		h.sdk.stored.set("t2", sdkSession({ topic: "t2", name: undefined }));
		h.sdk.stored.set("other", sdkSession({ topic: "other" }));

		const sessions = await h.connector.restore();

		expect(sessions).toEqual([
			{
				id: "t1",
				protocol: "bch-wc2",
				wallet: {
					name: "Cashonize",
					icon: "https://cashonize.com/icon.png",
					source: "protocol",
				},
				data: {
					chain: "bch:bchtest",
					addresses: [address],
					methods: proposedMethods,
				},
				status: { transport: "reconnecting", peer: "unknown" },
			},
			expect.objectContaining({ id: "t2", wallet: { source: "selection" } }),
		]);
		expect(fakeSdk.inits).toHaveLength(1);
		expect(h.sdk.disconnects).toEqual([]);
	});

	it("should drop recorded topics that are gone, expired or no longer valid", async () => {
		const storage = memory();
		await storage.set(
			"sessions",
			JSON.stringify({ v: 1, topics: ["gone", "expired", "invalid", "kept"] }),
		);
		const h = await harness({ storage });
		h.sdk.stored.set(
			"expired",
			sdkSession({
				topic: "expired",
				expiry: Math.floor(Date.now() / 1000) - 1,
			}),
		);
		h.sdk.stored.set("invalid", sdkSession({ topic: "invalid", accounts: [] }));
		h.sdk.stored.set("kept", sdkSession({ topic: "kept" }));

		const sessions = await h.connector.restore();

		expect(sessions.map((session) => session.id)).toEqual(["kept"]);
		expect(await recordedTopics(storage)).toEqual(["kept"]);
		expect(h.sdk.disconnects).toEqual([
			{
				topic: "invalid",
				reason: { code: 6000, message: "User disconnected." },
			},
		]);
	});

	it("should keep a recorded session of another network without ending it in the wallet", async () => {
		const storage = memory();
		await storage.set(
			"sessions",
			JSON.stringify({ v: 1, topics: ["mainnet", "chipnet"] }),
		);
		const h = await harness({ storage, network: "chipnet" });
		h.sdk.stored.set(
			"mainnet",
			sdkSession({ topic: "mainnet", accounts: ["bch:bitcoincash:qmain"] }),
		);
		h.sdk.stored.set("chipnet", sdkSession({ topic: "chipnet" }));

		const sessions = await h.connector.restore();

		expect(sessions.map((session) => session.id)).toEqual(["chipnet"]);
		expect(await recordedTopics(storage)).toEqual(["mainnet", "chipnet"]);
		expect(h.sdk.disconnects).toEqual([]);
	});

	it("should start the client once across restore and connect", async () => {
		const storage = memory();
		await storage.set("sessions", JSON.stringify({ v: 1, topics: ["t1"] }));
		const h = await harness({ storage });
		h.sdk.stored.set("t1", sdkSession({ topic: "t1" }));

		await h.connector.restore();
		await connected(h, sdkSession({ topic: "t2" }));

		expect(fakeSdk.inits).toHaveLength(1);
		expect(await recordedTopics(storage)).toEqual(["t1", "t2"]);
	});

	it("should reject a failed start as a transport failure", async () => {
		const storage = memory();
		await storage.set("sessions", JSON.stringify({ v: 1, topics: ["t1"] }));
		const h = await harness({ storage });
		const reason = new Error("init failed");
		fakeSdk.initError = reason;

		const error = await h.connector.restore().catch((e: unknown) => e);

		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({ cause: reason });
		expect(await recordedTopics(storage)).toEqual(["t1"]);
	});
});

describe("disconnect", () => {
	it("should end the session in the SDK and forget its topic", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ topic: "t1" }));

		await h.connector.disconnect(session);

		expect(h.sdk.disconnects).toEqual([
			{ topic: "t1", reason: { code: 6000, message: "User disconnected." } },
		]);
		expect(await recordedTopics(h.storage)).toEqual([]);
		expect(h.emit).not.toHaveBeenCalled();
	});

	it.each([
		["an offline relay", new Error("Relay offline")],
		[
			"a deleted record",
			new Error("Missing or invalid. Record was recently deleted"),
		],
	])(
		"should swallow %s, log it and still forget the topic",
		async (_, reason) => {
			const h = await harness();
			const session = await connected(h, sdkSession({ topic: "t1" }));
			h.sdk.disconnectError = reason;

			await expect(h.connector.disconnect(session)).resolves.toBeUndefined();

			expect(h.logger.warn).toHaveBeenCalledWith(
				"Ending the WalletConnect session failed",
				reason,
			);
			expect(await recordedTopics(h.storage)).toEqual([]);
		},
	);

	it("should do nothing more on a second call", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ topic: "t1" }));

		await h.connector.disconnect(session);
		await h.connector.disconnect(session);

		expect(h.sdk.disconnects).toHaveLength(1);
		expect(h.logger.warn).not.toHaveBeenCalled();
	});
});

describe("request", () => {
	it("should send extended-JSON params on the session's chain and return a valid result", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ topic: "t1" }));

		const result = h.connector.request(
			session,
			"bch_signTransaction",
			signRequest,
			{
				signal: new AbortController().signal,
				id: "r1",
			},
		);
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
		h.sdk.requests[0]?.resolve(signed);

		await expect(result).resolves.toEqual(signed);
		expect(h.sdk.requests[0]).toMatchObject({
			topic: "t1",
			chainId: "bch:bchtest",
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
						valueSatoshis: "<bigint: 10000n>",
					},
				],
				broadcast: false,
			},
		});
	});

	it("should send an empty object as the params of bch_getAddresses", async () => {
		const h = await harness();
		const session = await connected(h);

		const result = h.connector.request(session, "bch_getAddresses", undefined, {
			signal: new AbortController().signal,
		});
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
		h.sdk.requests[0]?.resolve([address]);

		await expect(result).resolves.toEqual([address]);
		expect(h.sdk.requests[0]?.params).toEqual({});
	});

	it.each([
		[undefined, 604_800],
		[1, 300],
		[30_000, 300],
		[300_500, 301],
		[1_000_000, 1000],
		[2 ** 31 - 1, 604_800],
	])(
		"should map a deadline of %s ms to a wire expiry of %i s",
		async (timeoutMs, expiry) => {
			const h = await harness();
			const session = await connected(h);

			void h.connector.request(
				session,
				"bch_signMessage",
				{ message: "hi" },
				{
					signal: new AbortController().signal,
					...(timeoutMs === undefined ? {} : { timeoutMs }),
				},
			);
			await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));

			expect(h.sdk.requests[0]?.expiry).toBe(expiry);
		},
	);

	it("should reject a method the session lacks before sending anything", async () => {
		const h = await harness();
		const session = await connected(
			h,
			sdkSession({ methods: ["bch_getAddresses"] }),
		);

		const error = await h.connector
			.request(session, "bch_signMessage", { message: "hi" })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(MethodUnsupportedError);
		expect(error).toMatchObject({ sessionId: "topic-1" });
		expect(h.sdk.requests).toEqual([]);
	});

	it("should send a custom method the session lists and return its answer unchecked", async () => {
		const h = await harness();
		const session = await connected(
			h,
			sdkSession({
				methods: ["bch_getAddresses", "bch_cancelPendingRequests"],
			}),
		);

		const result = h.connector.request(
			session,
			"bch_cancelPendingRequests",
			{},
		);
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
		h.sdk.requests[0]?.resolve("not the declared shape");

		await expect(result).resolves.toBe("not the declared shape");
		expect(h.sdk.requests[0]).toMatchObject({
			topic: "topic-1",
			chainId: "bch:bchtest",
			method: "bch_cancelPendingRequests",
			params: {},
		});
	});

	it("should encode a custom method's params like a standard one's and send {} for none", async () => {
		const h = await harness();
		const session = await connected(
			h,
			sdkSession({ methods: ["custom_withParams", "custom_noParams"] }),
		);
		const loose: Connector = h.connector;

		void loose.request(session, "custom_withParams", { amount: 5n });
		void loose.request(session, "custom_noParams", undefined);
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(2));

		expect(
			h.sdk.requests.map(({ method, params }) => [method, params]),
		).toEqual([
			["custom_withParams", { amount: "<bigint: 5n>" }],
			["custom_noParams", {}],
		]);
	});

	it("should reject a custom method the session lacks before sending anything", async () => {
		const h = await harness();
		const session = await connected(h);

		const error = await h.connector
			.request(session, "bch_cancelPendingRequests", {})
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(MethodUnsupportedError);
		expect(error).toMatchObject({ sessionId: "topic-1" });
		expect(h.sdk.requests).toEqual([]);
	});

	it("should reject a session it does not hold before sending anything", async () => {
		const h = await harness();
		const session = await connected(h);
		await h.connector.disconnect(session);

		const error = await h.connector
			.request(session, "bch_signMessage", { message: "hi" })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(SessionMissingError);
		expect(error).toMatchObject({ sessionId: "topic-1" });
		expect(h.sdk.requests).toEqual([]);
	});

	it.each([
		["bch_signTransaction", signRequest, {}],
		["bch_signMessage", { message: "hi" }, ""],
		["bch_getAddresses", undefined, []],
	] as const)(
		"should reject a malformed answer to %s",
		async (method, params, answer) => {
			const h = await harness();
			const session = await connected(h);

			const result = h.connector.request(session, method, params as never);
			await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
			h.sdk.requests[0]?.resolve(answer);
			const error = await result.catch((e: unknown) => e);

			expect(error).toBeInstanceOf(InvalidWalletResponseError);
			expect(error).toMatchObject({ sessionId: "topic-1" });
		},
	);

	it.each([
		[
			"a decline",
			{ code: 5000, message: "User rejected." },
			{ code: "REJECTED", by: "user" },
		],
		[
			"a wallet error",
			{ code: -32000, message: "Could not verify" },
			{ code: "REJECTED", by: "wallet" },
		],
		[
			"an expiry",
			Object.assign(new Error("expired"), { code: 6 }),
			{ code: "TIMEOUT" },
		],
		["a relay error", new Error("publish failed"), { code: "TRANSPORT" }],
	])("should map %s from the SDK", async (_, reason, expected) => {
		const h = await harness();
		const session = await connected(h);

		const result = h.connector.request(session, "bch_signMessage", {
			message: "hi",
		});
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
		h.sdk.requests[0]?.reject(reason);

		await expect(result).rejects.toMatchObject({
			...expected,
			cause: reason,
			sessionId: "topic-1",
		});
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should end the session when the wallet ended it mid-request", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ topic: "t1" }));
		const reason = { code: 6000, message: "User disconnected." };

		const result = h.connector.request(session, "bch_signMessage", {
			message: "hi",
		});
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
		h.sdk.requests[0]?.reject(reason);
		const error = await result.catch((e: unknown) => e);
		h.sdk.fire("session_delete", { topic: "t1" });

		expect(error).toBeInstanceOf(SessionMissingError);
		expect(error).toMatchObject({ sessionId: "t1", cause: reason });
		expect(h.emit.mock.calls).toEqual([
			["session:disconnected", { sessionId: "t1", reason: "wallet" }],
		]);
		await flush();
		expect(await recordedTopics(h.storage)).toEqual([]);
	});

	it("should reject at once on abort and send a cancel the wallet advertises, without awaiting it", async () => {
		const h = await harness();
		const session = await connected(
			h,
			sdkSession({
				methods: [...proposedMethods, "bch_cancelPendingRequests"],
			}),
		);
		const controller = new AbortController();
		const result = h.connector.request(
			session,
			"bch_signMessage",
			{ message: "hi" },
			{
				signal: controller.signal,
			},
		);
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
		const reason = new AbortedError("Aborted by caller");

		controller.abort(reason);

		await expect(result).rejects.toBe(reason);
		expect(
			h.sdk.requests.map((request) => [request.method, request.params]),
		).toEqual([
			["bch_signMessage", { message: "hi" }],
			["bch_cancelPendingRequests", {}],
		]);
		h.sdk.requests[1]?.reject(new Error("cancel failed"));
		h.sdk.requests[0]?.reject({ code: 5000, message: "User rejected." });
		await flush();
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should send no cancel when the wallet does not advertise one", async () => {
		const h = await harness();
		const session = await connected(h);
		const controller = new AbortController();
		const result = h.connector.request(
			session,
			"bch_signMessage",
			{ message: "hi" },
			{
				signal: controller.signal,
			},
		);
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));

		controller.abort(new TimeoutError("Request timed out"));

		await expect(result).rejects.toBeInstanceOf(TimeoutError);
		expect(h.sdk.requests).toHaveLength(1);
	});

	it("should send nothing with an already aborted signal", async () => {
		const h = await harness();
		const session = await connected(h);
		const reason = new AbortedError("Aborted by caller");

		await expect(
			h.connector.request(
				session,
				"bch_signMessage",
				{ message: "hi" },
				{
					signal: AbortSignal.abort(reason),
				},
			),
		).rejects.toBe(reason);
		expect(h.sdk.requests).toEqual([]);
	});
});

describe("session events", () => {
	it("should announce new addresses and methods from a session update", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ topic: "t1" }));
		const { namespaces } = sdkSession({
			accounts: ["bch:bchtest:qnew"],
			methods: ["bch_getAddresses"],
		});

		h.sdk.fire("session_update", { topic: "other", params: { namespaces } });
		h.sdk.fire("session_update", { topic: "t1", params: { namespaces } });

		expect(h.emit.mock.calls).toEqual([
			[
				"session:changed",
				{
					session: {
						...session,
						data: {
							chain: "bch:bchtest",
							addresses: ["bchtest:qnew"],
							methods: ["bch_getAddresses"],
						},
					},
					previous: session,
				},
			],
		]);
	});

	it("should end a session whose update no longer validates", async () => {
		const h = await harness();
		await connected(h, sdkSession({ topic: "t1" }));
		const { namespaces } = sdkSession({ accounts: [] });

		h.sdk.fire("session_update", { topic: "t1", params: { namespaces } });
		await flush();

		expect(h.emit.mock.calls).toEqual([
			["session:disconnected", { sessionId: "t1", reason: "error" }],
		]);
		expect(h.sdk.disconnects).toEqual([
			{ topic: "t1", reason: { code: 6000, message: "User disconnected." } },
		]);
		expect(await recordedTopics(h.storage)).toEqual([]);
	});

	it.each([
		["session_delete", "wallet"],
		["session_expire", "expired"],
	] as const)("should end the session on %s", async (event, reason) => {
		const h = await harness();
		await connected(h, sdkSession({ topic: "t1" }));

		h.sdk.fire(event, { topic: "other" });
		h.sdk.fire(event, { topic: "t1" });
		h.sdk.fire(event, { topic: "t1" });
		await flush();

		expect(h.emit.mock.calls).toEqual([
			["session:disconnected", { sessionId: "t1", reason }],
		]);
		expect(h.sdk.disconnects).toEqual([]);
		expect(await recordedTopics(h.storage)).toEqual([]);
	});

	it("should drop wallet events with a debug log", async () => {
		const h = await harness();
		await connected(h, sdkSession({ topic: "t1" }));

		h.sdk.fire("session_event", {
			topic: "t1",
			params: { event: { name: "addressesChanged" } },
		});

		expect(h.emit).not.toHaveBeenCalled();
		expect(h.logger.debug).toHaveBeenCalledWith(
			'Ignoring WalletConnect event "addressesChanged"',
		);
	});

	it("should follow the relay connection in every session's transport", async () => {
		const h = await harness();
		const first = await connected(h, sdkSession({ topic: "t1" }));
		const second = await connected(h, sdkSession({ topic: "t2" }));

		h.sdk.relayer.fire("relayer_disconnect");
		h.sdk.relayer.fire("relayer_disconnect");
		h.sdk.relayer.fire("relayer_connect");

		const reconnecting = { transport: "reconnecting", peer: "unknown" };
		const back = { transport: "connected", peer: "unknown" };
		expect(h.emit.mock.calls).toEqual([
			[
				"session:changed",
				{ session: { ...first, status: reconnecting }, previous: first },
			],
			[
				"session:changed",
				{ session: { ...second, status: reconnecting }, previous: second },
			],
			[
				"session:changed",
				{
					session: { ...first, status: back },
					previous: { ...first, status: reconnecting },
				},
			],
			[
				"session:changed",
				{
					session: { ...second, status: back },
					previous: { ...second, status: reconnecting },
				},
			],
		]);
	});
});

describe("capabilities", () => {
	it.each([
		[proposedMethods, ["libauth-signing", "message-signing"]],
		[["bch_signTransaction"], ["libauth-signing"]],
		[["bch_signMessage"], ["message-signing"]],
		[["bch_getAddresses"], []],
	])(
		"should derive capabilities from the methods %j",
		async (methods, expected) => {
			const h = await harness();
			const session = await connected(h, sdkSession({ methods }));

			expect(h.connector.capabilitiesOf(session)).toEqual(new Set(expected));
		},
	);

	it("should build the signing interfaces over the client's request", async () => {
		const h = await harness();
		const session = await connected(h);
		const request = vi.fn(async () => "result");
		const opts = { timeoutMs: 1000 };

		const capabilities = h.connector.capabilities?.(session, {
			request,
		} as never);
		await capabilities?.["libauth-signing"]?.signTransaction(signRequest, opts);
		await capabilities?.["message-signing"]?.signMessage({ message: "hi" });

		expect(request.mock.calls).toEqual([
			["bch_signTransaction", signRequest, opts],
			["bch_signMessage", { message: "hi" }, undefined],
		]);
	});
});

describe("dispose", () => {
	it("should release its listeners, leaving sessions and storage alone", async () => {
		const h = await harness();
		await connected(h, sdkSession({ topic: "t1" }));

		await h.connector.dispose?.();

		expect(h.sdk.listenerCount()).toBe(0);
		expect(h.sdk.disconnects).toEqual([]);
		expect(await recordedTopics(h.storage)).toEqual(["t1"]);
	});

	it("should load nothing when nothing was loaded", async () => {
		const h = await harness();

		await h.connector.dispose?.();

		expect(fakeSdk.imports).toBe(0);
	});

	it("should make a start still pending release what it opens", async () => {
		const storage = memory();
		await storage.set("sessions", JSON.stringify({ v: 1, topics: ["t1"] }));
		const h = await harness({ storage });
		h.sdk.stored.set("t1", sdkSession({ topic: "t1" }));
		let open = () => {};
		fakeSdk.initGate = new Promise((resolve) => {
			open = resolve;
		});
		const restoring = h.connector.restore();
		await vi.waitFor(() => expect(fakeSdk.inits).toHaveLength(1));

		const disposing = h.connector.dispose?.();
		open();
		await disposing;

		await expect(restoring).resolves.toEqual([]);
		expect(h.sdk.listenerCount()).toBe(0);
	});

	it("should leave the relay connection open, since the page shares it", async () => {
		const first = await harness();
		const second = await harness();
		await connected(first, sdkSession({ topic: "t1" }));
		await connected(second, sdkSession({ topic: "t2" }));

		await first.connector.dispose?.();
		second.sdk.fire("session_delete", { topic: "t2" });

		expect(first.sdk.relayer.connected).toBe(true);
		expect(second.emit.mock.calls).toEqual([
			["session:disconnected", { sessionId: "t2", reason: "wallet" }],
		]);
	});
});

describe("edge cases", () => {
	const cancelling = [...proposedMethods, "bch_cancelPendingRequests"];

	/** A store whose writes wait until `open()` is called. */
	function slowStore() {
		const inner = memory();
		let open = () => {};
		const gate = new Promise<void>((resolve) => {
			open = resolve;
		});
		const set = vi.fn(async (key: string, value: string) => {
			await gate;
			await inner.set(key, value);
		});
		const storage = {
			get: (key: string) => inner.get(key),
			set,
			delete: (key: string) => inner.delete(key),
		};
		return { storage, open, set };
	}

	it("should reject a connect whose session the wallet ended before it was saved", async () => {
		const { storage, open, set } = slowStore();
		const h = await harness({ storage });
		const connecting = connected(h, sdkSession({ topic: "t1" }));
		connecting.catch(() => {});
		await vi.waitFor(() => expect(set).toHaveBeenCalled());

		h.sdk.fire("session_delete", { topic: "t1" });
		open();
		const error = await connecting.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(SessionMissingError);
		expect(error).toMatchObject({ sessionId: "t1" });
		expect(await h.connector.restore()).toEqual([]);
	});

	it("should connect with the session as last updated while it was being saved", async () => {
		const { storage, open, set } = slowStore();
		const h = await harness({ storage });
		const connecting = connected(h, sdkSession({ topic: "t1" }));
		await vi.waitFor(() => expect(set).toHaveBeenCalled());
		const { namespaces } = sdkSession({ methods: ["bch_getAddresses"] });

		h.sdk.fire("session_update", { topic: "t1", params: { namespaces } });
		open();
		const session = await connecting;

		expect(session.data.methods).toEqual(["bch_getAddresses"]);
	});

	it("should send nothing once disposed with a pairing pending, even if the wallet approves later", async () => {
		const h = await harness();
		const { result, controller } = await startConnect(h);
		const reason = new AbortedError("Disposed");

		controller.abort(reason);
		await h.connector.dispose?.();
		await expect(result).rejects.toBe(reason);
		h.sdk.proposals[0]?.approve(sdkSession({ topic: "late" }));
		await flush();

		expect(h.sdk.pairingDisconnects).toEqual([]);
		expect(h.sdk.disconnects).toEqual([]);
	});

	it("should send no cancel once disposed with a request pending", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ methods: cancelling }));
		const controller = new AbortController();
		const result = h.connector.request(
			session,
			"bch_signMessage",
			{ message: "hi" },
			{ signal: controller.signal },
		);
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
		const reason = new AbortedError("Disposed");

		controller.abort(reason);
		await h.connector.dispose?.();
		await expect(result).rejects.toBe(reason);
		await flush();

		expect(h.sdk.requests.map((request) => request.method)).toEqual([
			"bch_signMessage",
		]);
	});

	it("should leave the wallet's other pending requests alone when one is aborted", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ methods: cancelling }));
		const signing = h.connector.request(session, "bch_signMessage", {
			message: "hi",
		});
		const controller = new AbortController();
		const reading = h.connector.request(
			session,
			"bch_getAddresses",
			undefined,
			{
				signal: controller.signal,
			},
		);
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(2));
		const reason = new AbortedError("Aborted by caller");

		controller.abort(reason);
		await expect(reading).rejects.toBe(reason);
		await flush();

		expect(h.sdk.requests.map((request) => request.method)).toEqual([
			"bch_signMessage",
			"bch_getAddresses",
		]);
		h.sdk.requests[0]?.resolve("H/signature==");
		await expect(signing).resolves.toBe("H/signature==");
	});

	it("should connect a wallet that sends no metadata", async () => {
		const h = await harness();
		const raw = { ...sdkSession(), peer: {} };

		const session = await connected(h, raw);

		expect(session.wallet).toEqual({ source: "selection" });
		expect(h.sdk.disconnects).toEqual([]);
	});

	it("should announce nothing for a session update that changes nothing", async () => {
		const h = await harness();
		const raw = sdkSession();
		await connected(h, raw);

		h.sdk.fire("session_update", {
			topic: raw.topic,
			params: { namespaces: raw.namespaces },
		});

		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should end the session in the wallet too when a request reports it ended", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ topic: "t1" }));

		const result = h.connector.request(session, "bch_signMessage", {
			message: "hi",
		});
		await vi.waitFor(() => expect(h.sdk.requests).toHaveLength(1));
		h.sdk.requests[0]?.reject({ code: 6000, message: "User disconnected." });
		await result.catch(() => {});
		await flush();

		expect(h.sdk.disconnects.map((call) => call.topic)).toEqual(["t1"]);
	});

	it("should forget a session without waiting for the wallet to hear about it", async () => {
		const h = await harness();
		const session = await connected(h, sdkSession({ topic: "t1" }));
		let finish = (): void => {};
		vi.spyOn(h.sdk, "disconnect").mockReturnValue(
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
		);

		const disconnecting = h.connector.disconnect(session);
		await flush();

		expect(await recordedTopics(h.storage)).toEqual([]);
		finish();
		await disconnecting;
	});
});

describe("with the client", () => {
	it("should connect, sign and follow the wallet's disconnect through the client", async () => {
		const sdk = fakeSdk.client;
		sdk.relayer.connected = true;
		const client = createClient({
			connectors: [walletConnect({ projectId: "project-1" })],
			network: "chipnet",
			appMetadata,
			storage: memory(),
		});
		const disconnected = vi.fn();
		client.on("session:disconnected", disconnected);
		await client.init();

		const connecting = client.connect("bch-wc2");
		await vi.waitFor(() => expect(sdk.proposals).toHaveLength(1));
		sdk.proposals[0]?.approve(sdkSession({ topic: "t1" }));
		const session = await connecting;
		const signing = client
			.capability(session, "message-signing")
			?.signMessage({ message: "hi" });
		await vi.waitFor(() => expect(sdk.requests).toHaveLength(1));
		sdk.requests[0]?.resolve("H/signature==");

		await expect(signing).resolves.toBe("H/signature==");
		expect(client.session("bch-wc2")?.data.addresses).toEqual([address]);
		sdk.fire("session_delete", { topic: "t1" });
		expect(disconnected).toHaveBeenCalledWith({
			sessionId: "t1",
			reason: "wallet",
		});
		expect(client.session("bch-wc2")).toBeNull();
		await client.dispose();
	});

	it("should restore a recorded session through the client and track the relay", async () => {
		// The client keeps connector records in the page's localStorage.
		const items = new Map([
			["bchconnect:bch-wc2:sessions", JSON.stringify({ v: 1, topics: ["t1"] })],
		]);
		vi.stubGlobal("window", {
			localStorage: {
				getItem: (key: string) => items.get(key) ?? null,
				setItem: (key: string, value: string) => items.set(key, value),
				removeItem: (key: string) => items.delete(key),
			},
		});
		const sdk = fakeSdk.client;
		sdk.stored.set("t1", sdkSession({ topic: "t1" }));
		const client = createClient({
			connectors: [walletConnect({ projectId: "project-1" })],
			network: "chipnet",
			appMetadata,
			storage: memory(),
		});

		try {
			await client.init();
			expect(client.session("bch-wc2")?.status.transport).toBe("reconnecting");
			sdk.relayer.fire("relayer_connect");

			expect(client.session("bch-wc2")?.status.transport).toBe("connected");
			await client.dispose();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
