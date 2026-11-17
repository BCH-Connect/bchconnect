import {
	AbortedError,
	ConfigError,
	InvalidWalletResponseError,
	type KeyValueStore,
	type MethodName,
	type MethodParams,
	MethodUnsupportedError,
	memory,
	type RequestOptions,
	RequestRejectedError,
	type Session,
	SessionMissingError,
	TimeoutError,
	TransportError,
} from "@bchconnect/core";
import { Bytes, Hasher } from "@cashconnect-js/core/primitives";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cashConnect } from "../src/connector.js";
import { loadSdk, type SdkPairedState } from "../src/sdk.js";
import { toTemplateHash } from "../src/store.js";
import { sendTemplate } from "../src/templates.js";
import {
	ErrorUserRejected,
	ErrorWalletRejected,
	type FakeDapp,
	fakeSdk,
	inviteOf,
	RELAY,
	RpcRemoteError,
	resetFakeSdk,
	socketError,
	WALLET,
} from "./fixtures/dapp.js";
import {
	appMetadata,
	beginConnect,
	connected,
	dappOf,
	flush,
	type Harness,
	harness,
	seed,
	startConnect,
	storedRecord,
	storedSlots,
	type TestCashConnect,
	template,
} from "./fixtures/harness.js";
import { loggedText } from "./fixtures/logger.js";

vi.mock(
	"@cashconnect-js/nostr/dapp",
	async () => (await import("./fixtures/dapp.js")).dappModule,
);
vi.mock(
	"@cashconnect-js/nostr",
	async () => (await import("./fixtures/dapp.js")).nostrModule,
);
// `loadSdk()` loads once per page, so a later test cannot count imports; it
// counts calls of the one function that imports instead.
vi.mock("../src/sdk.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/sdk.js")>();
	return { ...actual, loadSdk: vi.fn(actual.loadSdk) };
});

const OTHER_WALLET = "44".repeat(32);
const TOKEN = "33".repeat(32);
const WEEK_MS = 604_800_000;
const HASH = toTemplateHash(Hasher, template);

const transaction = {
	version: 2,
	locktime: 0,
	inputs: [
		{
			outpointIndex: 0,
			outpointTransactionHash: Uint8Array.of(0xab, 0xcd),
			sequenceNumber: 0,
			unlockingBytecode: Uint8Array.of(0x51),
		},
	],
	outputs: [
		{ lockingBytecode: Uint8Array.of(0x76, 0xa9), valueSatoshis: 1000n },
	],
};
const tokenOutput = {
	lockingBytecode: Uint8Array.of(0x76, 0xa9),
	valueSatoshis: 1000n,
	token: {
		amount: 0n,
		category: Uint8Array.of(0x33),
		nft: { capability: "none", commitment: Uint8Array.of(0x01) },
	},
};
const actionResponse = {
	data: {
		text: Bytes.fromUTF8("hi").toUint8Array(),
		total: Bytes.fromBigInt(123n).toUint8Array(),
	},
	transactions: [transaction],
	balanceChanges: { sats: -1000n },
};
const echo = {
	action: "echo",
	params: { text: "hi", amount: 1000n },
} as const;

function pairedState(dapp: FakeDapp): SdkPairedState {
	return {
		privateKeyHex: "11".repeat(32),
		walletPubkey: WALLET,
		allowedTokens: [...dapp.options.allowedTokens],
	};
}

/** A session object as a client would hold it, for an id the connector may not know. */
function sessionOf(id: string): Session<TestCashConnect> {
	return {
		id,
		protocol: "cashconnect",
		wallet: { source: "selection" },
		data: { walletPubkey: id, chain: "bchtest", template, allowedTokens: [] },
		status: { transport: "connected", peer: "unknown" },
	};
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(
		() => {
			throw new Error("Expected a rejection");
		},
		(error: unknown) => error,
	);
}

/** Sends a request and waits until the SDK holds it. */
async function sent<M extends MethodName<TestCashConnect>>(
	h: Harness,
	session: Session<TestCashConnect>,
	dapp: FakeDapp,
	method: M,
	params: MethodParams<TestCashConnect, M>,
	opts?: RequestOptions,
) {
	const before = dapp.requests.length;
	const result = h.connector.request(session, method, params, opts);
	result.catch(() => {});
	await vi.waitFor(() => expect(dapp.requests.length).toBe(before + 1), {
		interval: 1,
	});
	const request = dapp.requests[before];
	if (request === undefined) throw new Error("No request was sent");
	return { result, request };
}

beforeEach(() => {
	resetFakeSdk();
	vi.mocked(loadSdk).mockClear();
});

describe("cashConnect", () => {
	it("should implement the cashconnect protocol", () => {
		const connector = cashConnect({ template });

		expect(connector.protocol).toBe("cashconnect");
		expect(connector.methods).toEqual({
			executeAction: { userInteraction: true },
		});
	});

	it("should give every session the template-execution capability and no capability objects", async () => {
		const h = await harness();
		const { session } = await connected(h);

		expect(h.connector.capabilitiesOf(session)).toEqual(
			new Set(["template-execution"]),
		);
		expect(h.connector.capabilities).toBeUndefined();
	});

	it("should refuse to connect or restore before it is set up", async () => {
		const connector = cashConnect({ template });

		await expect(connector.connect({})).rejects.toMatchObject({
			code: "CONFIG",
			message: "The CashConnect connector was not set up",
		});
		await expect(connector.restore()).rejects.toBeInstanceOf(ConfigError);
	});
});

describe("setup", () => {
	it("should load nothing and touch no storage", async () => {
		const storage = memory();
		const get = vi.spyOn(storage, "get");
		const set = vi.spyOn(storage, "set");
		const remove = vi.spyOn(storage, "delete");

		await harness({ storage, config: { allowedTokens: [TOKEN] } });

		expect(loadSdk).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
		expect(set).not.toHaveBeenCalled();
		expect(remove).not.toHaveBeenCalled();
	});

	it.each([
		["uppercase", "AB".repeat(32)],
		["too short", "ab".repeat(31)],
		["too long", "ab".repeat(33)],
		["not hex", "zz".repeat(32)],
		["a wildcard", "*"],
	])("should refuse an allowed token that is %s", async (_, category) => {
		const error = await rejectionOf(
			harness({ config: { allowedTokens: [TOKEN, category] } }),
		);

		expect(error).toBeInstanceOf(ConfigError);
		expect(error).toMatchObject({
			code: "CONFIG",
			message: "allowedTokens[1] must be 64 lowercase hex characters",
		});
	});
});

describe("connect", () => {
	it("should reject with the signal's reason when it is already aborted, loading nothing", async () => {
		const h = await harness();
		const reason = new AbortedError("Stopped");

		const error = await rejectionOf(
			h.connector.connect({ signal: AbortSignal.abort(reason) }),
		);

		expect(error).toBe(reason);
		expect(loadSdk).not.toHaveBeenCalled();
		expect(fakeSdk.dapps).toEqual([]);
	});

	it("should wrap an abort reason that is not an error of the library", async () => {
		const h = await harness();

		const error = await rejectionOf(
			h.connector.connect({ signal: AbortSignal.abort("stop") }),
		);

		expect(error).toBeInstanceOf(AbortedError);
		expect(error).toMatchObject({ code: "ABORTED", cause: "stop" });
	});

	it("should reject TRANSPORT when the SDK fails to load", async () => {
		const h = await harness();
		const cause = new Error("Cannot find module");
		vi.mocked(loadSdk).mockRejectedValueOnce(cause);

		const error = await rejectionOf(h.connector.connect({}));

		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({
			code: "TRANSPORT",
			message: "The CashConnect SDK failed to load",
			cause,
		});
		expect(fakeSdk.dapps).toEqual([]);
	});

	it("should reject with the signal's reason when aborted while the SDK loads, building nothing", async () => {
		const h = await harness();
		const actual =
			await vi.importActual<typeof import("../src/sdk.js")>("../src/sdk.js");
		vi.mocked(loadSdk).mockImplementationOnce(async () => {
			await flush();
			return actual.loadSdk();
		});
		const controller = new AbortController();
		const reason = new AbortedError("Stopped");

		const result = h.connector.connect({ signal: controller.signal });
		controller.abort(reason);

		expect(await rejectionOf(result)).toBe(reason);
		await flush();
		expect(fakeSdk.dapps).toEqual([]);
	});

	it("should reject CONFIG for a template the SDK's schema refuses, before anything starts", async () => {
		const invalid = {
			name: "Broken",
			actions: { echo: { params: {}, instructions: "none", returns: {} } },
		};
		const h = await harness({ config: { template: invalid as never } });
		const onPairing = vi.fn();

		const error = await rejectionOf(h.connector.connect({ onPairing }));

		expect(error).toBeInstanceOf(ConfigError);
		expect(error).toMatchObject({
			code: "CONFIG",
			message: "The template is invalid: actions.echo.instructions",
		});
		expect(fakeSdk.dapps).toEqual([]);
		expect(onPairing).not.toHaveBeenCalled();
	});

	it("should build one instance with the dapp's identity, chain, template and tokens under a new slot", async () => {
		const h = await harness({
			config: { allowedTokens: [TOKEN] },
			appMetadata: {
				name: "Demo dapp",
				url: "https://dapp.example",
				icon: "https://dapp.example/icon.png",
				description: "A demo",
			},
		});

		const { dapp } = await connected(h);

		expect(loadSdk).toHaveBeenCalledTimes(1);
		expect(fakeSdk.dapps).toEqual([dapp]);
		expect(dapp.options).toMatchObject({
			info: {
				name: "Demo dapp",
				url: "https://dapp.example",
				icon: "https://dapp.example/icon.png",
				description: "A demo",
			},
			chain: "bchtest",
			allowedTokens: [TOKEN],
		});
		expect(dapp.options.template).toBe(template);
		expect(dapp.options.sessionKey).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("should leave out the optional identity fields the dapp did not set", async () => {
		const h = await harness();

		const { dapp } = await connected(h);

		expect(dapp.options.info).toStrictEqual({
			name: "Demo dapp",
			url: "https://dapp.example",
		});
		expect(dapp.options.allowedTokens).toEqual([]);
	});

	it("should hand the SDK objects of its own, since the SDK writes into them", async () => {
		const allowedTokens = Object.freeze([TOKEN]);
		const config = Object.freeze({ template, allowedTokens });
		const metadata = Object.freeze({ ...appMetadata });
		const h = await harness({ config, appMetadata: metadata });

		const { dapp } = await connected(h);

		expect(dapp.options).toHaveProperty("relayUrl", RELAY);
		expect(dapp.options.info).not.toBe(metadata);
		expect(dapp.options.allowedTokens).not.toBe(allowedTokens);
		expect(config).toEqual({ template, allowedTokens: [TOKEN] });
	});

	it.each([
		["mainnet", "bitcoincash"],
		["chipnet", "bchtest"],
		["regtest", "bchreg"],
	] as const)("should run on the chain of %s", async (network, chain) => {
		const h = await harness({ network });

		const { session, dapp } = await connected(h);

		expect(dapp.options.chain).toBe(chain);
		expect(session.data.chain).toBe(chain);
	});

	it("should listen to the instance before starting it", async () => {
		fakeSdk.startOutcome = () => "wait";
		const h = await harness();

		const { dapp } = await beginConnect(h);

		expect(dapp.calls).toEqual(["start"]);
		expect([...dapp.listeners.keys()].sort()).toEqual([
			"balancesChanged",
			"sessionDeleted",
			"sessionEstablished",
			"walletReachabilityChanged",
		]);
		expect(dapp.listenerCount()).toBe(4);
	});

	it("should run the SDK's heartbeat on the relay client and tear it down with the instance", async () => {
		const h = await harness();

		const { session, dapp } = await connected(h);

		expect(fakeSdk.heartbeats).toEqual([dapp.client]);
		expect(dapp.client.calls).toEqual([]);
		expect(fakeSdk.heartbeatStops).toBe(0);

		await h.connector.disconnect(session);

		expect(fakeSdk.heartbeatStops).toBe(1);
	});

	it("should start, hand the invite to onPairing, then wait for the wallet with the signal and no deadline", async () => {
		const h = await harness();

		const { dapp, pairings, controller } = await startConnect(h);

		expect(dapp.calls).toEqual(["start", "createInviteUrl", "pair"]);
		expect(pairings).toEqual([{ kind: "uri", uri: inviteOf(dapp) }]);
		expect(dapp.pairOptions).toEqual([{ signal: controller.signal }]);
	});

	it("should pair without a signal when the caller gave none", async () => {
		const h = await harness();

		const result = h.connector.connect({});
		await vi.waitFor(() => expect(fakeSdk.dapps[0]?.pairingPending).toBe(true));
		await fakeSdk.dapps[0]?.approve();

		await expect(result).resolves.toMatchObject({ id: WALLET });
		expect(fakeSdk.dapps[0]?.pairOptions).toStrictEqual([{}]);
	});

	it("should resolve with the session once the wallet approves, emitting nothing", async () => {
		const h = await harness();

		const { session } = await connected(h);

		expect(session).toStrictEqual({
			id: WALLET,
			protocol: "cashconnect",
			wallet: { source: "selection" },
			data: {
				walletPubkey: WALLET,
				chain: "bchtest",
				template,
				allowedTokens: [],
			},
			status: { transport: "connected", peer: "unknown" },
		});
		expect(session.data.template).toBe(template);
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should report the tokens the wallet granted, not the ones the dapp asked for", async () => {
		const h = await harness({
			config: { allowedTokens: [TOKEN, "55".repeat(32)] },
		});

		const { session } = await connected(h, WALLET, [TOKEN]);

		expect(session.data.allowedTokens).toEqual([TOKEN]);
	});

	it("should write storage only when the wallet pairs", async () => {
		const storage = memory();
		const set = vi.spyOn(storage, "set");
		const h = await harness({ storage });

		const { dapp, result } = await startConnect(h);
		await flush();

		expect(set).not.toHaveBeenCalled();
		expect(await storedSlots(storage)).toEqual([]);

		await dapp.approve(WALLET, [TOKEN]);
		await result;

		const slot = dapp.options.sessionKey;
		expect(await storedSlots(storage)).toEqual([slot]);
		expect(await storedRecord(storage, slot)).toEqual({
			v: 1,
			chain: "bchtest",
			template: HASH,
			state: {
				privateKeyHex: expect.stringMatching(/^[0-9a-f]{64}$/),
				walletPubkey: WALLET,
				allowedTokens: [TOKEN],
			},
		});
	});

	it("should keep the record current as the SDK rewrites it", async () => {
		const h = await harness();
		const { dapp } = await connected(h);

		dapp.receiveEvent();
		await flush();

		expect(
			await storedRecord(h.storage, dapp.options.sessionKey),
		).toMatchObject({ state: { lastEventTimestamp: 1_731_800_010 } });
	});

	it("should keep several sessions live, each on its own instance and slot", async () => {
		const h = await harness();

		const first = await connected(h, WALLET);
		const second = await connected(h, OTHER_WALLET);

		expect(first.dapp.options.sessionKey).not.toBe(
			second.dapp.options.sessionKey,
		);
		expect(first.dapp.options.store).not.toBe(second.dapp.options.store);
		expect(await storedSlots(h.storage)).toEqual([
			first.dapp.options.sessionKey,
			second.dapp.options.sessionKey,
		]);
		await sent(h, first.session, first.dapp, "getBalances", undefined);
		await sent(h, second.session, second.dapp, "getBalances", undefined);
		expect(first.dapp.requests).toHaveLength(1);
		expect(second.dapp.requests).toHaveLength(1);
	});

	it("should reject TRANSPORT and stop the instance when the relay cannot be reached", async () => {
		const cause = socketError();
		fakeSdk.startOutcome = () => ({ reject: cause });
		const h = await harness();
		const onPairing = vi.fn();

		const error = await rejectionOf(h.connector.connect({ onPairing }));
		await flush();

		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({
			code: "TRANSPORT",
			message: "The CashConnect relay could not be reached",
			cause,
		});
		expect(onPairing).not.toHaveBeenCalled();
		expect(fakeSdk.dapps[0]?.calls).toEqual(["start", "stop"]);
		expect(fakeSdk.dapps[0]?.listenerCount()).toBe(0);
		expect(await storedSlots(h.storage)).toEqual([]);
	});

	it("should reject TRANSPORT when the instance fails to start for another reason", async () => {
		const cause = new Error("Unsupported runtime");
		fakeSdk.startOutcome = () => ({ reject: cause });
		const h = await harness();

		const error = await rejectionOf(h.connector.connect({}));

		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({
			message: "The CashConnect connection could not start",
			cause,
		});
	});

	it("should reject at once when aborted while starting, and stop the instance again once its start settles", async () => {
		fakeSdk.startOutcome = () => "wait";
		const h = await harness();
		const { result, controller, dapp, pairings } = await beginConnect(h);
		const reason = new AbortedError("Stopped");

		controller.abort(reason);

		expect(await rejectionOf(result)).toBe(reason);
		await flush();
		expect(dapp.calls).toEqual(["start", "stop"]);

		dapp.settleStart();
		await flush();

		expect(dapp.calls).toEqual(["start", "stop", "stop"]);
		expect(dapp.client.isConnected()).toBe(false);
		expect(pairings).toEqual([]);
		expect(await storedSlots(h.storage)).toEqual([]);
	});

	it("should stop the instance again when a start it gave up on fails later", async () => {
		fakeSdk.startOutcome = () => "wait";
		const h = await harness();
		const { result, controller, dapp } = await beginConnect(h);

		controller.abort();
		await rejectionOf(result);
		dapp.settleStart({ reject: socketError() });
		await flush();

		expect(dapp.calls).toEqual(["start", "stop", "stop"]);
	});

	it("should reject with the signal's reason when aborted while pairing, and stop the instance once", async () => {
		const h = await harness();
		const { result, controller, dapp } = await startConnect(h);

		controller.abort("changed my mind");

		const error = await rejectionOf(result);
		await flush();
		expect(error).toBeInstanceOf(AbortedError);
		expect(error).toMatchObject({ code: "ABORTED", cause: "changed my mind" });
		expect(dapp.calls).toEqual(["start", "createInviteUrl", "pair", "stop"]);
		expect(dapp.forgets).toEqual([]);
		expect(dapp.listenerCount()).toBe(0);
		expect(await storedSlots(h.storage)).toEqual([]);
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should reject with the deadline's own error when the pairing times out", async () => {
		const h = await harness();
		const { result, controller } = await startConnect(h);
		const deadline = new TimeoutError("connect() timed out");

		controller.abort(deadline);

		expect(await rejectionOf(result)).toBe(deadline);
	});

	it("should leave no session when the wallet approves after the abort", async () => {
		const storage = memory();
		const set = vi.spyOn(storage, "set");
		const h = await harness({ storage });
		const { result, controller, dapp } = await startConnect(h);

		controller.abort();
		await rejectionOf(result);

		await expect(dapp.approve()).rejects.toThrow("No pairing in progress");
		await flush();
		expect(set).not.toHaveBeenCalled();
		expect(dapp.forgets).toEqual([]);
	});

	it("should end the session and erase its record when the abort lands while the wallet's approval is being handled", async () => {
		const storage = memory();
		const set = vi.spyOn(storage, "set");
		const h = await harness({ storage });
		const { result, controller, dapp } = await startConnect(h);
		const slot = dapp.options.sessionKey;

		const handling = dapp.approve();
		controller.abort();

		expect(await rejectionOf(result)).toBeInstanceOf(AbortedError);
		await expect(handling).rejects.toBeInstanceOf(TypeError);
		await flush();
		// The SDK's own write happened, so only the erase keeps the next page
		// load from restoring the session.
		expect(set).toHaveBeenCalledWith(`slot:${slot}`, expect.any(String));
		expect(dapp.calls).toEqual([
			"start",
			"createInviteUrl",
			"pair",
			"forgetSession",
			"stop",
		]);
		expect(dapp.forgets).toEqual(["Pairing cancelled by the dapp"]);
		expect(await storedSlots(storage)).toEqual([]);
		expect(await storedRecord(storage, slot)).toBeUndefined();
		expect(h.emit).not.toHaveBeenCalled();
		expect(await h.connector.restore()).toEqual([]);
	});

	it("should still stop the instance and erase its record when ending an abandoned session fails", async () => {
		const h = await harness();
		const { result, controller, dapp } = await startConnect(h);
		const cause = new Error("Relay rejected event: blocked");
		dapp.forgetError = cause;

		const handling = dapp.approve();
		controller.abort();
		await rejectionOf(result);
		await rejectionOf(handling);
		await flush();

		expect(h.logger.warn).toHaveBeenCalledWith(
			"Ending the CashConnect session failed",
			cause,
		);
		expect(dapp.calls.at(-1)).toBe("stop");
		expect(await storedSlots(h.storage)).toEqual([]);
	});

	it("should abandon the pairing and rethrow as is when onPairing throws", async () => {
		const h = await harness();
		const thrown = new Error("The modal broke");

		const error = await rejectionOf(
			h.connector.connect({
				onPairing: () => {
					throw thrown;
				},
			}),
		);
		await flush();

		expect(error).toBe(thrown);
		expect(fakeSdk.dapps[0]?.calls).toEqual([
			"start",
			"createInviteUrl",
			"stop",
		]);
		expect(await storedSlots(h.storage)).toEqual([]);
	});

	it("should reject TRANSPORT and abandon the pairing when pairing fails for another reason", async () => {
		const h = await harness();
		const { result, dapp } = await startConnect(h);
		const cause = new Error("Unexpected");

		dapp.rejectPairing(cause);

		const error = await rejectionOf(result);
		await flush();
		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({
			code: "TRANSPORT",
			message: "The CashConnect pairing failed",
			cause,
		});
		expect(dapp.calls.at(-1)).toBe("stop");
	});

	it("should never log the invite or put it in an error", async () => {
		const h = await harness();

		const aborted = await startConnect(h);
		aborted.dapp.options.logger.debug("[Dapp] started");
		aborted.controller.abort();
		const abortError = await rejectionOf(aborted.result);

		const failed = await startConnect(h);
		failed.dapp.rejectPairing(new ErrorUserRejected("Pairing cancelled"));
		const pairError = await rejectionOf(failed.result);

		const throwing = await rejectionOf(
			h.connector.connect({
				onPairing: () => {
					throw new Error("The modal broke");
				},
			}),
		);

		const paired = await connected(h);
		await h.connector.disconnect(paired.session);
		await flush();

		const invites = fakeSdk.dapps.map(inviteOf);
		const texts = [
			...loggedText(h.logger),
			...[abortError, pairError, throwing].map(
				(error) =>
					`${String(error)} ${String(error instanceof Error ? error.cause : "")}`,
			),
		].join("\n");
		expect(invites).toHaveLength(4);
		for (const invite of invites) {
			expect(texts).not.toContain(invite);
			expect(texts).not.toContain(invite.slice("bch-cc-v1:".length, 74));
		}
		expect(texts).not.toContain("bch-cc-v1:");
	});

	it("should forward the SDK's log lines, with its extra level as debug", async () => {
		const h = await harness();
		const { dapp } = await connected(h);
		const { logger } = dapp.options;

		logger.log("[Dapp] log", 1);
		logger.debug("[Dapp] debug", { a: 1 });
		logger.info("[Dapp] info");
		logger.warn("[Dapp] warn");
		logger.error("[Dapp] error", "x");

		expect(h.logger.debug.mock.calls).toEqual([
			["[Dapp] log", 1],
			["[Dapp] debug", { a: 1 }],
		]);
		expect(h.logger.info).toHaveBeenCalledWith("[Dapp] info");
		expect(h.logger.warn).toHaveBeenCalledWith("[Dapp] warn");
		expect(h.logger.error).toHaveBeenCalledWith("[Dapp] error", "x");
	});
});

describe("restore", () => {
	it("should resolve empty without loading the SDK when nothing is recorded", async () => {
		const h = await harness();

		await expect(h.connector.restore()).resolves.toEqual([]);

		expect(loadSdk).not.toHaveBeenCalled();
		expect(fakeSdk.dapps).toEqual([]);
	});

	it("should skip and keep the sessions of another chain, without loading the SDK", async () => {
		const h = await harness({ network: "mainnet" });
		await seed(h.storage, "slot-1");

		await expect(h.connector.restore()).resolves.toEqual([]);

		expect(loadSdk).not.toHaveBeenCalled();
		expect(await storedSlots(h.storage)).toEqual(["slot-1"]);
		expect(await storedRecord(h.storage, "slot-1")).toBeDefined();
	});

	it("should erase an unreadable record with a warning, without loading the SDK", async () => {
		const h = await harness();
		await h.storage.set(
			"sessions",
			JSON.stringify({ v: 1, slots: ["slot-1"] }),
		);
		await h.storage.set("slot:slot-1", JSON.stringify({ v: 2 }));

		await expect(h.connector.restore()).resolves.toEqual([]);

		expect(loadSdk).not.toHaveBeenCalled();
		expect(h.logger.warn).toHaveBeenCalledWith(
			"Erasing an unreadable CashConnect session record",
		);
		expect(await storedSlots(h.storage)).toEqual([]);
		expect(await storedRecord(h.storage, "slot-1")).toBeUndefined();
	});

	it("should start one instance on the recorded slot and return its session", async () => {
		const h = await harness({ config: { allowedTokens: [TOKEN, TOKEN] } });
		await seed(h.storage, "slot-1", { allowedTokens: [TOKEN] });

		const sessions = await h.connector.restore();

		const dapp = dappOf("slot-1");
		expect(loadSdk).toHaveBeenCalledTimes(1);
		expect(fakeSdk.dapps).toEqual([dapp]);
		expect(dapp.calls).toEqual(["start"]);
		expect(dapp.listenerCount()).toBe(4);
		expect(dapp.options).toMatchObject({
			info: appMetadata,
			chain: "bchtest",
			allowedTokens: [TOKEN, TOKEN],
		});
		expect(sessions).toStrictEqual([
			{
				id: WALLET,
				protocol: "cashconnect",
				wallet: { source: "selection" },
				data: {
					walletPubkey: WALLET,
					chain: "bchtest",
					template,
					allowedTokens: [TOKEN],
				},
				status: { transport: "connected", peer: "unknown" },
			},
		]);
		expect(h.emit).not.toHaveBeenCalled();
		expect(await storedSlots(h.storage)).toEqual(["slot-1"]);
	});

	it("should start every recorded slot in parallel and return the sessions in slot order", async () => {
		fakeSdk.startOutcome = () => "wait";
		const h = await harness();
		await seed(h.storage, "slot-1", { walletPubkey: WALLET });
		await seed(h.storage, "slot-2", { walletPubkey: OTHER_WALLET });

		const restoring = h.connector.restore();
		await vi.waitFor(() => expect(fakeSdk.dapps).toHaveLength(2));
		await flush();
		expect(fakeSdk.dapps.map((dapp) => dapp.calls)).toEqual([
			["start"],
			["start"],
		]);
		dappOf("slot-2").settleStart();
		await flush();
		dappOf("slot-1").settleStart();

		const sessions = await restoring;
		expect(sessions.map((session) => session.id)).toEqual([
			WALLET,
			OTHER_WALLET,
		]);
	});

	it("should make a restored session usable", async () => {
		const h = await harness();
		await seed(h.storage, "slot-1");
		const [session] = await h.connector.restore();
		if (session === undefined) throw new Error("Nothing was restored");

		const { result, request } = await sent(
			h,
			session,
			dappOf("slot-1"),
			"getBalances",
			undefined,
		);
		request.resolve({ sats: 5n });

		await expect(result).resolves.toEqual({ sats: 5n });
	});

	it("should end a session paired with another template in the background, on the wire and in storage", async () => {
		const h = await harness();
		await seed(h.storage, "slot-1", { template: sendTemplate });

		await expect(h.connector.restore()).resolves.toEqual([]);
		await flush();

		const dapp = dappOf("slot-1");
		expect(dapp.calls).toEqual(["start", "forgetSession", "stop"]);
		expect(dapp.forgets).toEqual(["The dapp's template changed"]);
		expect(dapp.listenerCount()).toBe(0);
		expect(await storedSlots(h.storage)).toEqual([]);
		expect(await storedRecord(h.storage, "slot-1")).toBeUndefined();
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should not wait for a session of another template to end", async () => {
		fakeSdk.startOutcome = (slot) => (slot === "slot-1" ? "wait" : "open");
		const h = await harness();
		await seed(h.storage, "slot-1", { template: sendTemplate });
		await seed(h.storage, "slot-2", { walletPubkey: OTHER_WALLET });

		const sessions = await h.connector.restore();

		expect(sessions.map((session) => session.id)).toEqual([OTHER_WALLET]);
		expect(dappOf("slot-1").calls).toEqual(["start"]);
		expect(await storedSlots(h.storage)).toEqual(["slot-1", "slot-2"]);
	});

	it("should keep the record of a session of another template whose relay cannot be reached, to end it on a later load", async () => {
		const cause = socketError();
		fakeSdk.startOutcome = () => ({ reject: cause });
		const h = await harness();
		await seed(h.storage, "slot-1", { template: sendTemplate });

		await expect(h.connector.restore()).resolves.toEqual([]);
		await flush();

		expect(dappOf("slot-1").calls).toEqual(["start", "stop"]);
		expect(dappOf("slot-1").listenerCount()).toBe(0);
		expect(h.logger.warn).toHaveBeenCalledWith(
			"Ending the CashConnect session failed",
			cause,
		);
		expect(await storedSlots(h.storage)).toEqual(["slot-1"]);
		expect(await storedRecord(h.storage, "slot-1")).toBeDefined();
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should stop and skip a slot that fails to start, keeping its record", async () => {
		fakeSdk.startOutcome = (slot) =>
			slot === "slot-1" ? { reject: socketError() } : "open";
		const h = await harness();
		await seed(h.storage, "slot-1", { walletPubkey: WALLET });
		await seed(h.storage, "slot-2", { walletPubkey: OTHER_WALLET });

		const sessions = await h.connector.restore();

		expect(sessions.map((session) => session.id)).toEqual([OTHER_WALLET]);
		expect(dappOf("slot-1").calls).toEqual(["start", "stop"]);
		expect(dappOf("slot-1").listenerCount()).toBe(0);
		expect(dappOf("slot-1").forgets).toEqual([]);
		expect(await storedSlots(h.storage)).toEqual(["slot-1", "slot-2"]);
		expect(await storedRecord(h.storage, "slot-1")).toBeDefined();
	});

	it("should reject TRANSPORT with the first cause when every slot fails to start, keeping the records", async () => {
		const first = socketError();
		fakeSdk.startOutcome = (slot) => ({
			reject: slot === "slot-1" ? first : new Error("second"),
		});
		const h = await harness();
		await seed(h.storage, "slot-1", { walletPubkey: WALLET });
		await seed(h.storage, "slot-2", { walletPubkey: OTHER_WALLET });

		const error = await rejectionOf(h.connector.restore());

		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({
			code: "TRANSPORT",
			message: "The CashConnect relay could not be reached",
			cause: first,
		});
		expect(fakeSdk.dapps.map((dapp) => dapp.calls)).toEqual([
			["start", "stop"],
			["start", "stop"],
		]);
		expect(await storedSlots(h.storage)).toEqual(["slot-1", "slot-2"]);
	});

	it("should reject TRANSPORT when the SDK fails to load", async () => {
		const h = await harness();
		await seed(h.storage, "slot-1");
		const cause = new Error("Cannot find module");
		vi.mocked(loadSdk).mockRejectedValueOnce(cause);

		const error = await rejectionOf(h.connector.restore());

		expect(error).toBeInstanceOf(TransportError);
		expect(error).toMatchObject({
			message: "The CashConnect SDK failed to load",
			cause,
		});
		expect(await storedSlots(h.storage)).toEqual(["slot-1"]);
	});

	it("should return only the sessions still live when it resolves", async () => {
		fakeSdk.startOutcome = (slot) => (slot === "slot-2" ? "wait" : "open");
		const h = await harness();
		await seed(h.storage, "slot-1", { walletPubkey: WALLET });
		await seed(h.storage, "slot-2", { walletPubkey: OTHER_WALLET });

		const restoring = h.connector.restore();
		await vi.waitFor(() => expect(fakeSdk.dapps).toHaveLength(2));
		await flush();
		// The wallet ended the first session while the dapp was closed: the
		// stored delete is delivered right after the start.
		await dappOf("slot-1").deleteSession();
		dappOf("slot-2").settleStart();

		const sessions = await restoring;
		expect(sessions.map((session) => session.id)).toEqual([OTHER_WALLET]);
		expect(await storedSlots(h.storage)).toEqual(["slot-2"]);
		expect(dappOf("slot-1").calls).toEqual(["start", "stop"]);
	});

	it("should return each session with the status it has when it resolves", async () => {
		fakeSdk.startOutcome = (slot) => (slot === "slot-2" ? "wait" : "open");
		const h = await harness();
		await seed(h.storage, "slot-1", { walletPubkey: WALLET });
		await seed(h.storage, "slot-2", { walletPubkey: OTHER_WALLET });

		const restoring = h.connector.restore();
		await vi.waitFor(() => expect(fakeSdk.dapps).toHaveLength(2));
		await flush();
		dappOf("slot-1").setReachable(true);
		dappOf("slot-2").settleStart();

		const sessions = await restoring;
		expect(sessions.map((session) => session.status)).toEqual([
			{ transport: "connected", peer: "reachable" },
			{ transport: "connected", peer: "unknown" },
		]);
	});

	it("should stop and skip a slot whose record is gone by the time the instance reads it", async () => {
		const h = await harness();
		await seed(h.storage, "slot-1");
		fakeSdk.startOutcome = (slot) => {
			void h.storage.delete(`slot:${slot}`);
			return "open";
		};

		await expect(h.connector.restore()).resolves.toEqual([]);

		expect(dappOf("slot-1").calls).toEqual(["start", "stop"]);
	});
});

describe("session status", () => {
	it("should start as reconnecting when the relay socket is down", async () => {
		const h = await harness();
		const { result, dapp } = await startConnect(h);

		dapp.dropSocket();
		await dapp.approve();

		expect((await result).status).toEqual({
			transport: "reconnecting",
			peer: "unknown",
		});
	});

	it("should start as reachable when the wallet already answered a ping", async () => {
		const h = await harness();
		const { result, dapp } = await startConnect(h);

		dapp.setReachable(true);
		await dapp.approve();

		expect((await result).status).toEqual({
			transport: "connected",
			peer: "reachable",
		});
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should not call the wallet reachable while the relay socket is down", async () => {
		const h = await harness();
		const { result, dapp } = await startConnect(h);

		dapp.setReachable(true);
		dapp.dropSocket();
		await dapp.approve();

		expect((await result).status).toEqual({
			transport: "reconnecting",
			peer: "unknown",
		});
	});

	it("should emit a new snapshot when the wallet becomes reachable", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);

		dapp.setReachable(true);

		expect(h.emit.mock.calls).toEqual([
			[
				"session:changed",
				{
					session: {
						...session,
						status: { transport: "connected", peer: "reachable" },
					},
					previous: session,
				},
			],
		]);
		expect(h.emit.mock.calls[0]?.[1]).toHaveProperty("previous", session);
		expect(session.status).toEqual({ transport: "connected", peer: "unknown" });
	});

	it("should call the wallet unreachable when it stops answering while the relay socket is up", async () => {
		const h = await harness();
		const { dapp } = await connected(h);
		dapp.setReachable(true);

		dapp.setReachable(false);

		expect(h.emit).toHaveBeenLastCalledWith(
			"session:changed",
			expect.objectContaining({
				session: expect.objectContaining({
					status: { transport: "connected", peer: "unreachable" },
				}),
				previous: expect.objectContaining({
					status: { transport: "connected", peer: "reachable" },
				}),
			}),
		);
	});

	it("should report reconnecting and an unknown peer when the wallet stops answering because the socket is down", async () => {
		const h = await harness();
		const { dapp } = await connected(h);
		dapp.setReachable(true);

		dapp.dropSocket();
		dapp.setReachable(false);

		expect(h.emit).toHaveBeenLastCalledWith(
			"session:changed",
			expect.objectContaining({
				session: expect.objectContaining({
					status: { transport: "reconnecting", peer: "unknown" },
				}),
			}),
		);
	});

	it("should report connected again, peer still unknown, when the socket reopens", async () => {
		const h = await harness();
		const { dapp } = await connected(h);
		dapp.setReachable(true);
		dapp.dropSocket();
		dapp.setReachable(false);

		dapp.openSocket();

		expect(h.emit).toHaveBeenCalledTimes(3);
		expect(h.emit).toHaveBeenLastCalledWith(
			"session:changed",
			expect.objectContaining({
				session: expect.objectContaining({
					status: { transport: "connected", peer: "unknown" },
				}),
			}),
		);
	});

	it("should report connected and reachable when the wallet answers while the session is reconnecting", async () => {
		const h = await harness();
		const { result, dapp } = await startConnect(h);
		dapp.dropSocket();
		await dapp.approve();
		await result;

		dapp.setReachable(true);

		expect(h.emit).toHaveBeenLastCalledWith(
			"session:changed",
			expect.objectContaining({
				session: expect.objectContaining({
					status: { transport: "connected", peer: "reachable" },
				}),
			}),
		);
	});

	it("should emit nothing when no value differs", async () => {
		const h = await harness();
		const { dapp } = await connected(h);

		dapp.openSocket();
		dapp.emit("walletReachabilityChanged", false);

		expect(h.emit).toHaveBeenCalledTimes(1);
		expect(h.emit).toHaveBeenLastCalledWith(
			"session:changed",
			expect.objectContaining({
				session: expect.objectContaining({
					status: { transport: "connected", peer: "unreachable" },
				}),
			}),
		);

		dapp.emit("walletReachabilityChanged", false);
		dapp.openSocket();

		expect(h.emit).toHaveBeenCalledTimes(1);
	});

	it("should ignore the socket opening and pings before the session exists", async () => {
		const h = await harness();
		const { dapp } = await startConnect(h);

		dapp.openSocket();
		dapp.setReachable(true);
		dapp.setReachable(false);

		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should serve requests for a session whatever snapshot the caller holds", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		dapp.setReachable(true);

		const { request } = await sent(h, session, dapp, "getBalances", undefined);

		expect(request.method).toBe("getBalances");
	});
});

describe("a session the wallet ends", () => {
	it("should be removed, reported, erased and its instance stopped", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const slot = dapp.options.sessionKey;

		await dapp.deleteSession();
		await flush();

		expect(h.emit.mock.calls).toEqual([
			["session:disconnected", { sessionId: WALLET, reason: "wallet" }],
		]);
		expect(dapp.calls.at(-1)).toBe("stop");
		expect(dapp.forgets).toEqual([]);
		expect(dapp.listenerCount()).toBe(0);
		expect(await storedSlots(h.storage)).toEqual([]);
		expect(await storedRecord(h.storage, slot)).toBeUndefined();
		await expect(
			h.connector.request(session, "getBalances", undefined),
		).rejects.toBeInstanceOf(SessionMissingError);
	});

	it("should refuse the writes the SDK makes after the end", async () => {
		const h = await harness();
		const { dapp } = await connected(h);
		const slot = dapp.options.sessionKey;
		await dapp.deleteSession();

		await dapp.options.store.set(slot, pairedState(dapp));

		expect(await storedSlots(h.storage)).toEqual([]);
		expect(await storedRecord(h.storage, slot)).toBeUndefined();
	});

	it("should report the unreachable wallet before the end, as the SDK orders it", async () => {
		const h = await harness();
		const { dapp } = await connected(h);
		dapp.setReachable(true);
		h.emit.mockClear();

		await dapp.deleteSession();

		expect(h.emit.mock.calls.map(([event]) => event)).toEqual([
			"session:changed",
			"session:disconnected",
		]);
	});

	it("should ignore a delete that arrives before the wallet paired", async () => {
		const h = await harness();
		const { result, dapp } = await startConnect(h);

		dapp.emit("sessionDeleted", undefined);
		await flush();

		expect(h.emit).not.toHaveBeenCalled();
		expect(dapp.calls).toEqual(["start", "createInviteUrl", "pair"]);
		await dapp.approve();
		await expect(result).resolves.toMatchObject({ id: WALLET });
	});

	it("should make later requests reject SESSION_MISSING and tell the client again why the session ended", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		await dapp.deleteSession();
		h.emit.mockClear();

		const error = await rejectionOf(
			h.connector.request(session, "getBalances", undefined),
		);

		expect(error).toBeInstanceOf(SessionMissingError);
		expect(error).toMatchObject({
			code: "SESSION_MISSING",
			message: "The CashConnect session is not connected",
			sessionId: WALLET,
		});
		expect(h.emit.mock.calls).toEqual([
			["session:disconnected", { sessionId: WALLET, reason: "wallet" }],
		]);
		expect(dapp.requests).toEqual([]);
	});

	it("should make later subscriptions a no-op and tell the client again why the session ended", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		await dapp.deleteSession();
		h.emit.mockClear();
		const listener = vi.fn();

		const unsubscribe = h.connector.subscribe(
			session,
			"balancesChanged",
			listener,
		);
		dapp.emit("balancesChanged", { sats: 1n });

		expect(unsubscribe()).toBeUndefined();
		expect(listener).not.toHaveBeenCalled();
		expect(h.emit.mock.calls).toEqual([
			["session:disconnected", { sessionId: WALLET, reason: "wallet" }],
		]);
	});

	it("should say nothing more about a session it never knew", async () => {
		const h = await harness();
		await connected(h);
		const unknown = sessionOf(OTHER_WALLET);

		const error = await rejectionOf(
			h.connector.request(unknown, "getBalances", undefined),
		);
		const unsubscribe = h.connector.subscribe(
			unknown,
			"balancesChanged",
			() => {},
		);

		expect(error).toMatchObject({
			code: "SESSION_MISSING",
			sessionId: OTHER_WALLET,
		});
		expect(unsubscribe()).toBeUndefined();
		expect(h.emit).not.toHaveBeenCalled();
	});
});

describe("subscribe", () => {
	it("should deliver the wallet's balances until unsubscribed", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const listener = vi.fn();
		const other = vi.fn();
		const balances = { sats: 5n, [TOKEN]: 2n };

		const unsubscribe = h.connector.subscribe(
			session,
			"balancesChanged",
			listener,
		);
		h.connector.subscribe(session, "balancesChanged", other);
		dapp.emit("balancesChanged", balances);
		unsubscribe();
		dapp.emit("balancesChanged", { sats: 6n });

		expect(listener.mock.calls).toEqual([[{ balances }]]);
		expect(other).toHaveBeenCalledTimes(2);
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should deliver only the balances of the listener's own session", async () => {
		const h = await harness();
		const first = await connected(h, WALLET);
		const second = await connected(h, OTHER_WALLET);
		const listener = vi.fn();
		h.connector.subscribe(first.session, "balancesChanged", listener);

		second.dapp.emit("balancesChanged", { sats: 1n });

		expect(listener).not.toHaveBeenCalled();
	});

	it("should keep a throwing listener from reaching the SDK or the other listeners", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const thrown = new Error("Listener broke");
		const other = vi.fn();
		h.connector.subscribe(session, "balancesChanged", () => {
			throw thrown;
		});
		h.connector.subscribe(session, "balancesChanged", other);

		expect(() => dapp.emit("balancesChanged", { sats: 1n })).not.toThrow();

		expect(other).toHaveBeenCalledWith({ balances: { sats: 1n } });
		expect(h.logger.warn).toHaveBeenCalledWith(
			"A CashConnect event listener threw",
			thrown,
		);
	});

	it("should drop balances that are malformed, with a warning", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const listener = vi.fn();
		h.connector.subscribe(session, "balancesChanged", listener);

		dapp.emit("balancesChanged", { [TOKEN]: 2n });

		expect(listener).not.toHaveBeenCalled();
		expect(h.logger.warn).toHaveBeenCalledWith(
			"Ignoring malformed CashConnect balances",
		);
	});

	it("should stop delivering once the session is disconnected", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const listener = vi.fn();
		h.connector.subscribe(session, "balancesChanged", listener);

		await h.connector.disconnect(session);
		dapp.emit("balancesChanged", { sats: 1n });

		expect(listener).not.toHaveBeenCalled();
	});
});

describe("disconnect", () => {
	it("should erase the record, tell the wallet, then stop the instance, emitting nothing", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const slot = dapp.options.sessionKey;
		dapp.setReachable(true);
		h.emit.mockClear();

		await h.connector.disconnect(session);

		expect(dapp.calls).toEqual([
			"start",
			"createInviteUrl",
			"pair",
			"forgetSession",
			"stop",
		]);
		expect(dapp.forgets).toEqual(["Disconnected by the dapp"]);
		expect(dapp.listenerCount()).toBe(0);
		expect(await storedSlots(h.storage)).toEqual([]);
		expect(await storedRecord(h.storage, slot)).toBeUndefined();
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should erase the record before the wallet is told", async () => {
		const storage = memory();
		const h = await harness({ storage });
		const { session, dapp } = await connected(h);
		const order: string[] = [];
		vi.spyOn(storage, "delete").mockImplementation(async (key) => {
			order.push(`delete ${key}`);
		});
		vi.spyOn(dapp, "forgetSession").mockImplementation(async () => {
			order.push("forgetSession");
		});

		await h.connector.disconnect(session);

		expect(order).toEqual([
			`delete slot:${dapp.options.sessionKey}`,
			"delete sessions",
			"forgetSession",
		]);
	});

	it("should refuse the writes the SDK makes afterwards", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const slot = dapp.options.sessionKey;
		await h.connector.disconnect(session);

		await dapp.options.store.set(slot, pairedState(dapp));

		expect(await storedSlots(h.storage)).toEqual([]);
		expect(await storedRecord(h.storage, slot)).toBeUndefined();
	});

	it("should do nothing the second time, or for a session it does not hold", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		await h.connector.disconnect(session);
		const calls = [...dapp.calls];

		await expect(h.connector.disconnect(session)).resolves.toBeUndefined();
		await expect(
			h.connector.disconnect(sessionOf(OTHER_WALLET)),
		).resolves.toBeUndefined();

		expect(dapp.calls).toEqual(calls);
		expect(dapp.forgets).toHaveLength(1);
	});

	it("should log and not throw when the wallet cannot be told or the instance cannot stop", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const forgetError = new Error("Dapp.start() must be called first.");
		const stopError = new Error("Socket already closed");
		dapp.forgetError = forgetError;
		dapp.stopError = stopError;

		await expect(h.connector.disconnect(session)).resolves.toBeUndefined();

		expect(h.logger.warn.mock.calls).toEqual([
			["Ending the CashConnect session failed", forgetError],
			["Stopping the CashConnect connection failed", stopError],
		]);
		expect(dapp.calls.slice(-2)).toEqual(["forgetSession", "stop"]);
		expect(await storedSlots(h.storage)).toEqual([]);
	});

	it("should make later requests reject SESSION_MISSING without an event", async () => {
		const h = await harness();
		const { session } = await connected(h);
		await h.connector.disconnect(session);

		await expect(
			h.connector.request(session, "getBalances", undefined),
		).rejects.toMatchObject({ code: "SESSION_MISSING", sessionId: WALLET });
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should leave the other sessions alone", async () => {
		const h = await harness();
		const first = await connected(h, WALLET);
		const second = await connected(h, OTHER_WALLET);

		await h.connector.disconnect(first.session);

		expect(second.dapp.calls).not.toContain("stop");
		expect(await storedSlots(h.storage)).toEqual([
			second.dapp.options.sessionKey,
		]);
	});
});

describe("dispose", () => {
	it("should stop every instance and release its listeners, sending nothing and keeping the records", async () => {
		const h = await harness();
		const live = await connected(h, WALLET);
		const pairing = await startConnect(h);

		await h.connector.dispose?.();

		for (const dapp of [live.dapp, pairing.dapp]) {
			expect(dapp.calls.at(-1)).toBe("stop");
			expect(dapp.calls.filter((call) => call === "stop")).toHaveLength(1);
			expect(dapp.forgets).toEqual([]);
			expect(dapp.listenerCount()).toBe(0);
		}
		expect(fakeSdk.heartbeatStops).toBe(2);
		expect(await storedSlots(h.storage)).toEqual([
			live.dapp.options.sessionKey,
		]);
		expect(h.emit).not.toHaveBeenCalled();
	});

	it("should not throw when an instance cannot stop", async () => {
		const h = await harness();
		const { dapp } = await connected(h);
		dapp.stopError = new Error("Socket already closed");

		await expect(h.connector.dispose?.()).resolves.toBeUndefined();

		expect(h.logger.warn).toHaveBeenCalledWith(
			"Stopping the CashConnect connection failed",
			dapp.stopError,
		);
	});

	it("should leave nothing to send requests through or to disconnect", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		await h.connector.dispose?.();
		const calls = [...dapp.calls];

		await expect(
			h.connector.request(session, "getBalances", undefined),
		).rejects.toBeInstanceOf(SessionMissingError);
		await h.connector.disconnect(session);

		expect(dapp.calls).toEqual(calls);
		expect(await storedSlots(h.storage)).toEqual([dapp.options.sessionKey]);
	});

	it("should refuse a connect that follows", async () => {
		const h = await harness();
		await h.connector.dispose?.();

		const error = await rejectionOf(h.connector.connect({}));

		expect(error).toBeInstanceOf(AbortedError);
		expect(error).toMatchObject({
			code: "ABORTED",
			message: "The CashConnect connector was disposed",
		});
		expect(fakeSdk.dapps).toEqual([]);
	});

	it("should build nothing for a connect that was still loading the SDK", async () => {
		const h = await harness();
		const actual =
			await vi.importActual<typeof import("../src/sdk.js")>("../src/sdk.js");
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		vi.mocked(loadSdk).mockImplementationOnce(async () => {
			await gate;
			return actual.loadSdk();
		});

		const result = h.connector.connect({});
		result.catch(() => {});
		await flush();
		await h.connector.dispose?.();
		release();

		expect(await rejectionOf(result)).toMatchObject({
			code: "ABORTED",
			message: "The CashConnect connector was disposed",
		});
		expect(fakeSdk.dapps).toEqual([]);
	});

	it("should stop an instance a connect was starting, again once the start settles, and reject that connect", async () => {
		fakeSdk.startOutcome = () => "wait";
		const h = await harness();
		const { result, dapp, pairings } = await beginConnect(h);

		await h.connector.dispose?.();
		expect(dapp.calls).toEqual(["start", "stop"]);
		dapp.settleStart();

		expect(await rejectionOf(result)).toMatchObject({
			code: "ABORTED",
			message: "The CashConnect connector was disposed",
		});
		await flush();
		expect(dapp.calls).toEqual(["start", "stop", "stop"]);
		expect(pairings).toEqual([]);
	});

	it("should send nothing for a pairing that is aborted after it", async () => {
		const h = await harness();
		const { result, controller, dapp } = await startConnect(h);

		await h.connector.dispose?.();
		controller.abort();

		expect(await rejectionOf(result)).toBeInstanceOf(AbortedError);
		await flush();
		expect(dapp.calls).toEqual(["start", "createInviteUrl", "pair", "stop"]);
		expect(dapp.forgets).toEqual([]);
	});

	it("should reject a connect whose wallet approved while it was disposed, sending nothing and keeping the record", async () => {
		const h = await harness();
		const { result, dapp } = await startConnect(h);

		await h.connector.dispose?.();
		await dapp.approve();

		expect(await rejectionOf(result)).toMatchObject({
			code: "ABORTED",
			message: "The CashConnect connector was disposed",
		});
		await flush();
		expect(dapp.forgets).toEqual([]);
		expect(dapp.calls).toEqual(["start", "createInviteUrl", "pair", "stop"]);
		expect(await storedSlots(h.storage)).toEqual([dapp.options.sessionKey]);
	});

	it("should build nothing for a restore that was still loading the SDK", async () => {
		const h = await harness();
		await seed(h.storage, "slot-1");
		const actual =
			await vi.importActual<typeof import("../src/sdk.js")>("../src/sdk.js");
		vi.mocked(loadSdk).mockImplementationOnce(async () => {
			await h.connector.dispose?.();
			return actual.loadSdk();
		});

		await expect(h.connector.restore()).resolves.toEqual([]);

		expect(fakeSdk.dapps).toEqual([]);
		expect(await storedSlots(h.storage)).toEqual(["slot-1"]);
	});

	it("should stop the instances a restore was starting and resolve that restore empty, keeping the records", async () => {
		fakeSdk.startOutcome = () => "wait";
		const h = await harness();
		await seed(h.storage, "slot-1");
		const restoring = h.connector.restore();
		await vi.waitFor(() => expect(fakeSdk.dapps).toHaveLength(1));
		await flush();
		const dapp = dappOf("slot-1");

		await h.connector.dispose?.();
		expect(dapp.calls).toEqual(["start", "stop"]);
		dapp.settleStart();

		await expect(restoring).resolves.toEqual([]);
		await flush();
		expect(dapp.calls).toEqual(["start", "stop", "stop"]);
		expect(dapp.forgets).toEqual([]);
		expect(await storedSlots(h.storage)).toEqual(["slot-1"]);
	});

	it("should leave alone a session of another template whose end had not been sent", async () => {
		fakeSdk.startOutcome = () => "wait";
		const h = await harness();
		await seed(h.storage, "slot-1", { template: sendTemplate });
		await h.connector.restore();
		await vi.waitFor(() => expect(fakeSdk.dapps).toHaveLength(1));
		const dapp = dappOf("slot-1");

		await h.connector.dispose?.();
		dapp.settleStart();
		await flush();

		expect(dapp.forgets).toEqual([]);
		expect(await storedSlots(h.storage)).toEqual(["slot-1"]);
	});

	it("should resolve a restore empty when the SDK fails to load after it", async () => {
		const h = await harness();
		await seed(h.storage, "slot-1");
		vi.mocked(loadSdk).mockImplementationOnce(async () => {
			await h.connector.dispose?.();
			throw new Error("Cannot find module");
		});

		await expect(h.connector.restore()).resolves.toEqual([]);
		expect(fakeSdk.dapps).toEqual([]);
	});
});

describe("request", () => {
	it("should reject METHOD_UNSUPPORTED for a method the protocol does not have, before anything else", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);

		const error = await rejectionOf(
			h.connector.request(session, "signMessage" as never, undefined as never, {
				signal: AbortSignal.abort(),
			}),
		);

		expect(error).toBeInstanceOf(MethodUnsupportedError);
		expect(error).toMatchObject({
			code: "METHOD_UNSUPPORTED",
			message: 'CashConnect has no method "signMessage"',
			sessionId: WALLET,
		});
		expect(dapp.requests).toEqual([]);
	});

	it("should reject with the signal's reason when it is already aborted, sending nothing", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const reason = new AbortedError("Stopped");

		const error = await rejectionOf(
			h.connector.request(session, "getBalances", undefined, {
				signal: AbortSignal.abort(reason),
			}),
		);

		expect(error).toBe(reason);
		expect(dapp.requests).toEqual([]);
	});

	it("should send a read with the caller's deadline and signal, and resolve with the wallet's balances", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const controller = new AbortController();
		const balances = { sats: 5n, [TOKEN]: 2n };

		const { result, request } = await sent(
			h,
			session,
			dapp,
			"getBalances",
			undefined,
			{ signal: controller.signal, timeoutMs: 30_000 },
		);
		request.resolve(balances);

		expect(request.options).toStrictEqual({
			timeoutMs: 30_000,
			signal: controller.signal,
		});
		await expect(result).resolves.toBe(balances);
	});

	it("should give a request without a deadline a week on the relay, and no signal", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);

		const { request } = await sent(h, session, dapp, "executeAction", echo);

		expect(request.options).toStrictEqual({ timeoutMs: WEEK_MS });
	});

	it.each([
		["no sats", { [TOKEN]: 2n }],
		["an amount that is not a bigint", { sats: 5 }],
		["no object", "5"],
	])(
		"should reject INVALID_WALLET_RESPONSE for balances with %s",
		async (_, answer) => {
			const h = await harness();
			const { session, dapp } = await connected(h);

			const { result, request } = await sent(
				h,
				session,
				dapp,
				"getBalances",
				undefined,
			);
			request.resolve(answer);

			const error = await rejectionOf(result);
			expect(error).toBeInstanceOf(InvalidWalletResponseError);
			expect(error).toMatchObject({
				code: "INVALID_WALLET_RESPONSE",
				message: 'The wallet sent a malformed answer to "getBalances"',
				sessionId: WALLET,
			});
		},
	);

	it("should resolve getTokens with the wallet's outputs", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const outputs = [tokenOutput];

		const { result, request } = await sent(
			h,
			session,
			dapp,
			"getTokens",
			undefined,
			{ timeoutMs: 1000 },
		);
		request.resolve(outputs);

		expect(request.options).toStrictEqual({ timeoutMs: 1000 });
		await expect(result).resolves.toBe(outputs);
	});

	it.each([
		["no list", { outputs: [] }],
		["an output without a value", [{ lockingBytecode: Uint8Array.of(1) }]],
		["a txid instead of an output", ["ab".repeat(32)]],
	])(
		"should reject INVALID_WALLET_RESPONSE for tokens with %s",
		async (_, answer) => {
			const h = await harness();
			const { session, dapp } = await connected(h);

			const { result, request } = await sent(
				h,
				session,
				dapp,
				"getTokens",
				undefined,
			);
			request.resolve(answer);

			expect(await rejectionOf(result)).toMatchObject({
				code: "INVALID_WALLET_RESPONSE",
				message: 'The wallet sent a malformed answer to "getTokens"',
				sessionId: WALLET,
			});
		},
	);

	it("should encode an action's params by their declared types and decode what it returns", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const params = Object.freeze({ text: "hi", amount: 1000n });

		const { result, request } = await sent(
			h,
			session,
			dapp,
			"executeAction",
			Object.freeze({ action: "echo", params }),
			{ timeoutMs: 60_000 },
		);
		request.resolve({
			...actionResponse,
			meta: { title: [], description: [] },
			utxos: [],
		});

		expect(request.action).toBe("echo");
		expect(request.params).toStrictEqual({
			text: Bytes.fromUTF8("hi").toUint8Array(),
			amount: Bytes.fromBigInt(1000n).toUint8Array(),
		});
		expect(request.options).toStrictEqual({ timeoutMs: 60_000 });
		const answer = await result;
		expect(answer).toStrictEqual({
			data: { text: "hi", total: 123n },
			transactions: [transaction],
			balanceChanges: { sats: -1000n },
		});
		expect(answer.transactions[0]).toBe(transaction);
	});

	it.each([
		["an unknown action", { action: "mint", params: {} }],
		["a missing param", { action: "echo", params: { text: "hi" } }],
		[
			"an unknown param",
			{ action: "echo", params: { ...echo.params, memo: "x" } },
		],
		[
			"a param of the wrong type",
			{ action: "echo", params: { text: "hi", amount: 1000 } },
		],
		[
			"a negative amount",
			{ action: "echo", params: { text: "hi", amount: -5n } },
		],
		["no params", { action: "echo" }],
		["no action name", { params: echo.params }],
		["no object", "echo"],
	])("should reject CONFIG before the wire for %s", async (_, call) => {
		const h = await harness();
		const { session, dapp } = await connected(h);

		const error = await rejectionOf(
			h.connector.request(session, "executeAction", call as never),
		);

		expect(error).toBeInstanceOf(ConfigError);
		expect(error).toMatchObject({ code: "CONFIG", sessionId: WALLET });
		expect(dapp.requests).toEqual([]);
	});

	it("should never put a param's value in the error", async () => {
		const h = await harness();
		const { session } = await connected(h);

		const error = await rejectionOf(
			h.connector.request(session, "executeAction", {
				action: "echo",
				params: { text: "hi", amount: "123456789" },
			} as never),
		);

		expect(String(error)).toContain('"amount"');
		expect(String(error)).toContain('"echo"');
		expect(String(error)).not.toContain("123456789");
	});

	it.each([
		["a transaction that is not one", { transactions: ["0200"] }],
		["a balance change that is not a bigint", { balanceChanges: { sats: -1 } }],
		["data that is not an object", { data: "hi" }],
		[
			"a value that does not decode",
			{ data: { ...actionResponse.data, total: Uint8Array.of(0x80) } },
		],
		["a missing value", { data: { text: actionResponse.data.text } }],
	])(
		"should reject INVALID_WALLET_RESPONSE for an action answer with %s",
		async (_, change) => {
			const h = await harness();
			const { session, dapp } = await connected(h);

			const { result, request } = await sent(
				h,
				session,
				dapp,
				"executeAction",
				echo,
			);
			request.resolve({ ...actionResponse, ...change });

			const error = await rejectionOf(result);
			expect(error).toBeInstanceOf(InvalidWalletResponseError);
			expect(error).toMatchObject({
				code: "INVALID_WALLET_RESPONSE",
				sessionId: WALLET,
			});
		},
	);

	it("should reject REJECTED without attribution when the wallet declines or fails an action", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const cause = new ErrorWalletRejected("User cancelled");

		const { result, request } = await sent(
			h,
			session,
			dapp,
			"executeAction",
			echo,
		);
		request.reject(cause);

		const error = await rejectionOf(result);
		expect(error).toBeInstanceOf(RequestRejectedError);
		expect(error).toMatchObject({
			code: "REJECTED",
			by: "unknown",
			remoteMessage: "User cancelled",
			sessionId: WALLET,
			cause,
		});
	});

	it("should reject REJECTED when the wallet answers a read with an error", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const cause = new RpcRemoteError("getBalances", "Wallet is locked");

		const { result, request } = await sent(
			h,
			session,
			dapp,
			"getBalances",
			undefined,
		);
		request.reject(cause);

		expect(await rejectionOf(result)).toMatchObject({
			code: "REJECTED",
			by: "unknown",
			remoteMessage: "Wallet is locked",
			sessionId: WALLET,
			cause,
		});
	});

	it.each([
		[
			"TIMEOUT",
			TimeoutError,
			"The request expired",
			new Error("RPC execution timeout [Method: getTokens | ID: 7]"),
		],
		[
			"INVALID_WALLET_RESPONSE",
			InvalidWalletResponseError,
			"The wallet sent a malformed answer",
			new Error("RPC response validation failed for getTokens: bad"),
		],
		[
			"TRANSPORT",
			TransportError,
			"The CashConnect relay failed",
			new Error("Cannot publish: WebSocket transport is disconnected."),
		],
		[
			"TRANSPORT",
			TransportError,
			"The CashConnect relay failed",
			new Error("Relay timed out acknowledging event publication."),
		],
		[
			"TRANSPORT",
			TransportError,
			"The CashConnect request failed",
			new Error("Something else"),
		],
		[
			"REJECTED",
			RequestRejectedError,
			"The wallet declined the request",
			"declined",
		],
	] as const)(
		"should reject %s as the SDK's failure maps",
		async (code, type, message, cause) => {
			const h = await harness();
			const { session, dapp } = await connected(h);

			const { result, request } = await sent(
				h,
				session,
				dapp,
				"getTokens",
				undefined,
			);
			request.reject(cause);

			const error = await rejectionOf(result);
			expect(error).toBeInstanceOf(type);
			expect(error).toMatchObject({ code, message, cause, sessionId: WALLET });
		},
	);

	it("should reject SESSION_MISSING when the SDK no longer holds the pairing", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);

		// The SDK drops the pairing, then writes, then reports the delete.
		const deleting = dapp.deleteSession();
		const error = await rejectionOf(
			h.connector.request(session, "getBalances", undefined),
		);
		await deleting;

		expect(error).toBeInstanceOf(SessionMissingError);
		expect(error).toMatchObject({
			code: "SESSION_MISSING",
			sessionId: WALLET,
			cause: expect.objectContaining({
				message: expect.stringContaining("Not paired with a wallet yet"),
			}),
		});
	});

	it("should reject with the abort reason at once when cancelled, leaving the cancel to the SDK", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const controller = new AbortController();
		const { result, request } = await sent(
			h,
			session,
			dapp,
			"executeAction",
			echo,
			{ signal: controller.signal },
		);

		controller.abort("changed my mind");

		const error = await rejectionOf(result);
		expect(error).toBeInstanceOf(AbortedError);
		expect(error).toMatchObject({ code: "ABORTED", cause: "changed my mind" });
		expect(request.cancelled).toBe(true);
		expect(dapp.requests).toHaveLength(1);
	});

	it("should reject with the deadline's own error when a request times out", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const controller = new AbortController();
		const deadline = new TimeoutError('Request "getBalances" timed out');
		const { result } = await sent(h, session, dapp, "getBalances", undefined, {
			signal: controller.signal,
			timeoutMs: 30_000,
		});

		controller.abort(deadline);

		expect(await rejectionOf(result)).toBe(deadline);
	});

	it("should cancel only the request that was aborted", async () => {
		const h = await harness();
		const { session, dapp } = await connected(h);
		const controller = new AbortController();
		const kept = await sent(h, session, dapp, "executeAction", echo);
		const dropped = await sent(h, session, dapp, "executeAction", echo, {
			signal: controller.signal,
		});

		controller.abort();
		await rejectionOf(dropped.result);
		kept.request.resolve(actionResponse);

		expect(kept.request.cancelled).toBe(false);
		await expect(kept.result).resolves.toMatchObject({
			data: { text: "hi", total: 123n },
		});
	});
});

describe("storage", () => {
	it("should keep every session's record under the connector's own keys", async () => {
		const storage: KeyValueStore = memory();
		const set = vi.spyOn(storage, "set");
		const h = await harness({ storage });

		const { dapp } = await connected(h);

		expect(new Set(set.mock.calls.map(([key]) => key))).toEqual(
			new Set(["sessions", `slot:${dapp.options.sessionKey}`]),
		);
	});
});
