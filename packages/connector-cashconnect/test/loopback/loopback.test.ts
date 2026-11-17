import {
	createClient,
	memory,
	type Session,
	type SessionStatus,
	stringifyExtendedJson,
} from "@bchconnect/core";
import {
	binToHex,
	createVirtualMachineBch,
	encodeTransactionBch,
	hashTransactionUiOrder,
} from "@bitauth/libauth";
import { PrivateKey } from "@cashconnect-js/core/primitives";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cashConnect } from "../../src/connector.js";
import { executeAction } from "../../src/execute-action.js";
import type { CashConnectTemplate } from "../../src/template.js";
import { sendTemplate } from "../../src/templates.js";
import type { CashConnect, CashConnectConfig } from "../../src/types.js";
import { type SpyLogger, spyLogger } from "../fixtures/logger.js";
import { type Relay, startRelay } from "./relay.js";
import {
	createUtxo,
	recipientAddress,
	recipientLockingBytecode,
	recipientMainnetAddress,
	startWallet,
	type Wallet,
	walletLockingBytecode,
} from "./wallet.js";

/** The shipped send action, plus an action that spends nothing and returns what it was given. */
const template = {
	name: "Loopback",
	actions: {
		...sendTemplate.actions,
		echo: {
			params: {
				text: { type: "string", name: "Text" },
				amount: { type: "satoshis", name: "Amount" },
			},
			instructions: [
				{
					type: "resolve",
					payload: { text: "<text>", total: "<amount>", fixed: "<123>" },
				},
			],
			returns: {
				text: { type: "string", name: "Text" },
				total: { type: "number", name: "Total" },
				fixed: { type: "number", name: "Fixed" },
			},
		},
	},
} as const satisfies CashConnectTemplate;

const relayUrl = "wss://nostr.infra.cash";
const appMetadata = { name: "Demo dapp", url: "https://dapp.example" };
const category = "c0".repeat(32);
// The timers the SDKs keep; promises and the clock stay real.
const timers: Parameters<typeof vi.useFakeTimers>[0] = {
	toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
};

let relay: Relay;
let wallet: Wallet;
let logger: SpyLogger;
/** The page's `localStorage`, where core keeps connector records across clients. */
let items: Map<string, string>;
const invites: string[] = [];
const disposers: (() => Promise<void>)[] = [];

function newClient<const T extends CashConnectTemplate>(
	config: CashConnectConfig<T>,
) {
	const client = createClient({
		connectors: [cashConnect(config)],
		network: "chipnet",
		appMetadata,
		storage: memory(),
		logger,
	});
	disposers.push(() => client.dispose());
	return client;
}

type Client = ReturnType<typeof newClient<typeof template>>;
type LoopbackSession = Session<CashConnect<typeof template>>;

/** Returns `promise`, marked as handled until a test asserts on it. */
function later<T>(promise: Promise<T>): Promise<T> {
	promise.catch(() => {});
	return promise;
}

/** Waits for a condition the SDKs reach over the relay. */
function until(assertion: () => void): Promise<void> {
	return vi.waitFor(assertion, { timeout: 5000, interval: 10 });
}

/** The connector's records, by their key in its storage namespace. */
function storedRecords(): Record<string, unknown> {
	const prefix = "bchconnect:cashconnect:";
	return Object.fromEntries(
		[...items]
			.filter(([key]) => key.startsWith(prefix))
			.map(([key, value]) => [key.slice(prefix.length), JSON.parse(value)]),
	);
}

/** The public key an invite carries. */
function dappKeyOf(invite: string): string {
	return invite.slice("bch-cc-v1:".length, invite.indexOf("?"));
}

interface Pairing {
	readonly invite: string;
	readonly result: Promise<LoopbackSession>;
}

/** Starts `connect()` and waits for its invite. */
async function startPairing(
	client: Client,
	options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<Pairing> {
	let invite: string | undefined;
	const result = later(
		client.connect("cashconnect", {
			...options,
			onPairing: (pairing) => {
				if (pairing.kind === "uri") invite = pairing.uri;
			},
		}),
	);
	await until(() => expect(invite).toBeDefined());
	invites.push(invite ?? "");
	return { invite: invite ?? "", result };
}

/** Connects `client` to the wallet, which approves. */
async function connect(client: Client): Promise<LoopbackSession> {
	const { invite, result } = await startPairing(client);
	await wallet.sdk.pair(invite);
	return result;
}

/** Waits until the wallet answered the session's first liveness ping, so no ping is in flight. */
async function untilReachable(
	client: Client,
	sessionId: string,
): Promise<void> {
	await until(() =>
		expect(client.sessions.get(sessionId)?.status).toEqual({
			transport: "connected",
			peer: "reachable",
		}),
	);
}

beforeEach(async () => {
	relay = startRelay();
	items = new Map();
	vi.stubGlobal("window", {
		localStorage: {
			getItem: (key: string) => items.get(key) ?? null,
			setItem: (key: string, value: string) => items.set(key, value),
			removeItem: (key: string) => items.delete(key),
		},
	});
	logger = spyLogger();
	wallet = await startWallet();
	wallet.utxos = [createUtxo(100_000n)];
	// The wallet's connection to the SDK's default relay ended in the in-memory one.
	expect(relay.urls).toEqual([relayUrl]);
	expect(relay.openSockets()).toBe(1);
});

afterEach(async () => {
	for (const dispose of disposers.splice(0)) await dispose();
	await wallet.close();
	const logged = [logger.debug, logger.info, logger.warn, logger.error]
		.flatMap((level) => level.mock.calls.flat())
		.map((value) =>
			value instanceof Error
				? `${value.message} ${String(value.cause)}`
				: typeof value === "string"
					? value
					: stringifyExtendedJson(value),
		)
		.join("\n");
	for (const invite of invites.splice(0)) expect(logged).not.toContain(invite);
	expect(relay.urls.filter((url) => url !== relayUrl)).toEqual([]);
	relay.close();
	vi.useRealTimers();
});

describe("pairing", () => {
	it("should send the wallet its proposal and adopt the session the wallet approves", async () => {
		const client = newClient({ template });
		await client.init();

		const { invite, result } = await startPairing(client);
		expect(invite).toMatch(
			/^bch-cc-v1:[0-9a-f]{64}\?relay=wss%3A%2F%2Fnostr\.infra\.cash$/,
		);
		// Nothing is recorded for an identity no wallet paired with.
		expect(storedRecords()).toEqual({});
		const paired = await wallet.sdk.pair(invite);
		const session = await result;

		expect(wallet.proposals).toHaveLength(1);
		expect(wallet.proposals[0]).toMatchObject({
			dapp: appMetadata,
			chain: "bchtest",
			template: { name: "Loopback" },
			allowedTokens: [],
			methods: ["getBalances", "getTokens", "executeAction"],
			events: ["balancesChanged"],
		});
		expect(Object.keys(wallet.proposals[0]?.template.actions ?? {})).toEqual([
			"send",
			"echo",
		]);
		expect(paired.dappPubkey).toBe(dappKeyOf(invite));
		const walletKey = PrivateKey.from(paired.sessionPrivateKeyHex)
			.derivePublicKey()
			.toXOnly()
			.toHex();
		expect(session).toEqual({
			id: walletKey,
			protocol: "cashconnect",
			wallet: { source: "selection" },
			data: {
				walletPubkey: walletKey,
				chain: "bchtest",
				template,
				allowedTokens: [],
			},
			status: { transport: "connected", peer: "unknown" },
		});
		expect(client.sessions.get(walletKey)).toEqual(session);
		await untilReachable(client, walletKey);

		const { sessions, ...slots } = storedRecords();
		const [key] = Object.keys(slots);
		expect(sessions).toEqual({ v: 1, slots: [key?.slice("slot:".length)] });
		expect(slots).toEqual({
			[key ?? ""]: {
				v: 1,
				chain: "bchtest",
				template: expect.stringMatching(/^[0-9a-f]{64}$/),
				state: {
					privateKeyHex: expect.stringMatching(/^[0-9a-f]{64}$/),
					walletPubkey: walletKey,
					allowedTokens: [],
					lastEventTimestamp: expect.any(Number),
				},
			},
		});
	});

	it("should reject TIMEOUT at its deadline and keep nothing when the wallet declines", async () => {
		const client = newClient({ template });
		await client.init();
		wallet.answerProposal = () => Promise.reject(new Error("Declined"));

		const { invite, result } = await startPairing(client, { timeoutMs: 300 });
		// A decline stays in the wallet: nothing tells the dapp.
		await expect(wallet.sdk.pair(invite)).rejects.toThrow("Declined");

		await expect(result).rejects.toMatchObject({ code: "TIMEOUT" });
		expect(client.sessions.size).toBe(0);
		expect(wallet.sdk.getActiveSessions()).toEqual({});
		await until(() => expect(relay.openSockets()).toBe(1));
		expect(storedRecords()).toEqual({});
	});

	it("should leave no session on either side when the wallet approves after the caller aborted", async () => {
		vi.useFakeTimers(timers);
		const client = newClient({ template });
		await client.init();
		const controller = new AbortController();
		let approve = (): void => {};
		wallet.answerProposal = ({ allowedTokens }) =>
			new Promise((resolve) => {
				approve = () => resolve({ allowedTokens });
			});

		const { invite, result } = await startPairing(client, {
			signal: controller.signal,
		});
		const pairing = later(wallet.sdk.pair(invite));
		await until(() => expect(wallet.proposals).toHaveLength(1));
		controller.abort();
		await expect(result).rejects.toMatchObject({ code: "ABORTED" });
		await until(() => expect(relay.openSockets()).toBe(1));

		const published = relay.events.length;
		approve();
		await until(() => expect(relay.events).toHaveLength(published + 1));
		// The wallet waits ten seconds for the dapp to confirm the session.
		await vi.advanceTimersByTimeAsync(10_000);

		await expect(pairing).rejects.toThrow("RPC execution timeout");
		expect(wallet.sdk.getActiveSessions()).toEqual({});
		expect(client.sessions.size).toBe(0);
		expect(storedRecords()).toEqual({});
	});

	it("should reject TRANSPORT and keep nothing when the relay refuses the connection", async () => {
		const client = newClient({ template });
		await client.init();
		relay.refuse();
		const onPairing = vi.fn();

		await expect(
			client.connect("cashconnect", { onPairing }),
		).rejects.toMatchObject({ code: "TRANSPORT" });

		expect(onPairing).not.toHaveBeenCalled();
		expect(client.sessions.size).toBe(0);
		expect(relay.openSockets()).toBe(1);
		expect(storedRecords()).toEqual({});

		relay.accept();
		await expect(connect(client)).resolves.toMatchObject({
			protocol: "cashconnect",
		});
	});
});

describe("requests", () => {
	it("should run an action that spends nothing and decode what it returns", async () => {
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);

		const sentAt = Date.now() / 1000;
		const result = await client.request(session, "executeAction", {
			action: "echo",
			params: { text: "hello", amount: 1000n },
		});

		expect(result).toEqual({
			data: { text: "hello", total: 1000n, fixed: 123n },
			transactions: [],
			balanceChanges: {},
		});
		expect(wallet.actions).toHaveLength(1);
		expect(wallet.actions[0]?.request).toEqual({
			action: "echo",
			params: {
				text: new TextEncoder().encode("hello"),
				amount: Uint8Array.of(0xe8, 0x03),
			},
		});
		// A request without a deadline stays on the relay for a week.
		const expirations = relay.events
			.filter((event) => event.pubkey === wallet.session().dappPubkey)
			.map((event) =>
				Number(event.tags.find(([name]) => name === "expiration")?.[1]),
			);
		expect(Math.max(...expirations)).toBeGreaterThanOrEqual(
			Math.floor(sentAt) + 604_800 + 5,
		);
		expect(Math.max(...expirations)).toBeLessThanOrEqual(
			Math.ceil(Date.now() / 1000) + 604_800 + 5,
		);
	});

	it("should have the wallet build and sign a valid transaction with the shipped send action", async () => {
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);
		const [coin] = wallet.utxos;

		const { data, transactions, balanceChanges } = await executeAction(
			client,
			session,
			"send",
			{ recipient: recipientAddress, amount: 1000n },
		);

		expect(wallet.actions[0]?.request).toEqual({
			action: "send",
			params: {
				recipient: recipientLockingBytecode,
				amount: Uint8Array.of(0xe8, 0x03),
			},
		});
		expect(transactions).toHaveLength(1);
		const [transaction] = transactions;
		if (transaction === undefined) throw new Error("No transaction");
		const built = {
			...transaction,
			inputs: [...transaction.inputs],
			outputs: [...transaction.outputs],
		};
		expect(built.inputs).toHaveLength(1);
		expect(built.inputs[0]?.outpointTransactionHash).toEqual(
			coin?.outpointTransactionHash,
		);
		expect(
			createVirtualMachineBch().verify({
				transaction: built,
				sourceOutputs: [
					{ lockingBytecode: walletLockingBytecode, valueSatoshis: 100_000n },
				],
			}),
		).toBe(true);
		// The change is what the coin held, less the amount and the wallet's fee.
		expect(built.outputs).toEqual([
			{ lockingBytecode: recipientLockingBytecode, valueSatoshis: 1000n },
			{ lockingBytecode: walletLockingBytecode, valueSatoshis: 97_815n },
		]);
		expect(balanceChanges).toEqual({ sats: -2185n });
		expect(binToHex(data.tx)).toBe(binToHex(encodeTransactionBch(built)));
		expect(binToHex(data.txHash)).toBe(
			binToHex(hashTransactionUiOrder(data.tx)),
		);
	});

	it.each([
		{ amount: 128n, bytes: Uint8Array.of(0x80, 0x00) },
		{ amount: 1000n, bytes: Uint8Array.of(0xe8, 0x03) },
	])(
		"should pay the recipient exactly $amount satoshis",
		async ({ amount, bytes }) => {
			const client = newClient({ template });
			await client.init();
			const session = await connect(client);

			const { transactions } = await executeAction(client, session, "send", {
				recipient: recipientAddress,
				amount,
			});

			expect(wallet.actions[0]?.request.params).toEqual({
				recipient: recipientLockingBytecode,
				amount: bytes,
			});
			expect(transactions[0]?.outputs[0]).toEqual({
				lockingBytecode: recipientLockingBytecode,
				valueSatoshis: amount,
			});
		},
	);

	it("should reject CONFIG for a recipient of another network without reaching the wallet", async () => {
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);

		const sending = executeAction(client, session, "send", {
			recipient: recipientMainnetAddress,
			amount: 1000n,
		});

		await expect(sending).rejects.toMatchObject({
			code: "CONFIG",
			sessionId: session.id,
		});
		await expect(sending).rejects.not.toThrow(recipientMainnetAddress);
		// A request sent afterwards is the first one the wallet sees.
		await client.request(session, "getBalances", undefined);
		expect(wallet.actions).toEqual([]);
	});

	it("should reject REJECTED by an unknown party with the wallet's text when the wallet declines an action", async () => {
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);
		wallet.answerAction = () => Promise.reject(new Error("User cancelled"));

		await expect(
			executeAction(client, session, "echo", { text: "hi", amount: 1n }),
		).rejects.toMatchObject({
			code: "REJECTED",
			by: "unknown",
			remoteMessage: "User cancelled",
			sessionId: session.id,
		});
	});

	it("should read the wallet's balances", async () => {
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);
		wallet.utxos = [createUtxo(100_000n), createUtxo(50_000n)];

		await expect(
			client.request(session, "getBalances", undefined),
		).resolves.toEqual({ sats: 150_000n });
	});

	it("should read the tokens of the categories the wallet granted", async () => {
		const client = newClient({ template, allowedTokens: [category] });
		await client.init();
		const session = await connect(client);
		const nft = {
			category: Uint8Array.from({ length: 32 }, () => 0xc0),
			amount: 7n,
			nft: { capability: "mutable" as const, commitment: Uint8Array.of(1, 2) },
		};
		wallet.utxos = [
			createUtxo(100_000n),
			createUtxo(1000n, nft),
			// A category the session was not granted stays hidden.
			createUtxo(1000n, { ...nft, category: new Uint8Array(32) }),
		];

		expect(session.data.allowedTokens).toEqual([category]);
		await expect(
			client.request(session, "getTokens", undefined),
		).resolves.toEqual([
			{
				lockingBytecode: walletLockingBytecode,
				valueSatoshis: 1000n,
				token: nft,
			},
		]);
		await expect(
			client.request(session, "getBalances", undefined),
		).resolves.toEqual({ sats: 101_000n, [category]: 7n });
	});

	it("should reject ABORTED at once and abort the wallet's handler when a request is cancelled", async () => {
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);
		await untilReachable(client, session.id);
		wallet.answerAction = ({ signal }) =>
			new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(new Error("Cancelled")));
			});
		const controller = new AbortController();
		const fromWallet = () =>
			relay.events.filter((event) => event.pubkey === session.id).length;

		const running = later(
			executeAction(
				client,
				session,
				"echo",
				{ text: "hi", amount: 1n },
				{ signal: controller.signal },
			),
		);
		await until(() => expect(wallet.actions).toHaveLength(1));
		const answered = fromWallet();
		controller.abort();

		await expect(running).rejects.toMatchObject({ code: "ABORTED" });
		// The dapp does not wait for the wallet to hear of the cancel.
		expect(wallet.actions[0]?.signal.aborted).toBe(false);
		await until(() => expect(wallet.actions[0]?.signal.aborted).toBe(true));
		expect(wallet.actions[0]?.signal.reason).toBe("aborted");

		// The wallet answers a later request, and never the cancelled one.
		await expect(
			client.request(session, "getBalances", undefined),
		).resolves.toEqual({ sats: 100_000n });
		expect(fromWallet()).toBe(answered + 1);
	});
});

describe("session events", () => {
	it("should deliver the wallet's balance changes to subscribers", async () => {
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);
		const listener = vi.fn();
		client.subscribe(session, "balancesChanged", listener);

		wallet.utxos = [createUtxo(100_000n), createUtxo(2000n)];
		await wallet.sdk.notifyBalancesChanged();

		await until(() => expect(listener).toHaveBeenCalledTimes(1));
		expect(listener).toHaveBeenCalledWith({ balances: { sats: 102_000n } });
	});

	it("should end the session, its pending request and its record when the wallet disconnects", async () => {
		const client = newClient({ template });
		const disconnected = vi.fn();
		client.on("session:disconnected", disconnected);
		await client.init();
		const session = await connect(client);
		wallet.answerAction = () => new Promise(() => {});

		const running = later(
			executeAction(client, session, "echo", { text: "hi", amount: 1n }),
		);
		await until(() => expect(wallet.actions).toHaveLength(1));
		await wallet.sdk.disconnectSession(wallet.session().dappPubkey);

		await expect(running).rejects.toMatchObject({
			code: "SESSION_MISSING",
			sessionId: session.id,
		});
		expect(disconnected).toHaveBeenCalledTimes(1);
		expect(disconnected).toHaveBeenCalledWith({
			sessionId: session.id,
			reason: "wallet",
		});
		expect(client.sessions.size).toBe(0);
		await until(() => expect(storedRecords()).toEqual({}));
		await until(() => expect(relay.openSockets()).toBe(1));
	});

	it("should end the session in the wallet and erase its record when the dapp disconnects", async () => {
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);
		const { dappPubkey } = wallet.session();

		await client.disconnect(session);

		expect(client.sessions.size).toBe(0);
		expect(storedRecords()).toEqual({});
		await until(() => expect(wallet.deleted).toEqual([dappPubkey]));
		expect(wallet.sdk.getActiveSessions()).toEqual({});
		expect(relay.openSockets()).toBe(1);
	});

	it("should follow the relay connection in the session status", async () => {
		vi.useFakeTimers(timers);
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);
		await untilReachable(client, session.id);
		const statuses: SessionStatus[] = [];
		client.on("session:changed", (change) =>
			statuses.push(change.session.status),
		);

		relay.dropLatest();
		// The SDK notices at its next ping of the wallet, every ten seconds.
		await vi.advanceTimersByTimeAsync(10_000);
		await until(() =>
			expect(statuses).toEqual([
				{ transport: "reconnecting", peer: "unknown" },
			]),
		);
		// Its heartbeat reconnects, every fifteen seconds.
		await vi.advanceTimersByTimeAsync(5000);
		await until(() =>
			expect(statuses).toEqual([
				{ transport: "reconnecting", peer: "unknown" },
				{ transport: "connected", peer: "unknown" },
			]),
		);
		await vi.advanceTimersByTimeAsync(5000);
		await until(() =>
			expect(statuses).toEqual([
				{ transport: "reconnecting", peer: "unknown" },
				{ transport: "connected", peer: "unknown" },
				{ transport: "connected", peer: "reachable" },
			]),
		);

		expect(relay.openSockets()).toBe(2);
		await expect(
			client.request(session, "getBalances", undefined),
		).resolves.toEqual({ sats: 100_000n });
	});
});

describe("restore", () => {
	it("should restore a session after a reload and serve requests over it", async () => {
		const first = newClient({ template });
		await first.init();
		const session = await connect(first);
		await untilReachable(first, session.id);
		await first.dispose();
		const records = storedRecords();
		expect(Object.keys(records)).toHaveLength(2);

		const second = newClient({ template });
		await second.init();

		expect(second.sessions.size).toBe(1);
		expect(second.sessions.get(session.id)).toEqual({
			...session,
			status: { transport: "connected", peer: "unknown" },
		});
		await untilReachable(second, session.id);
		const restored = second.session("cashconnect");
		if (restored === null) throw new Error("No restored session");
		await expect(
			executeAction(second, restored, "echo", { text: "again", amount: 2n }),
		).resolves.toMatchObject({ data: { text: "again", total: 2n } });
		expect(Object.keys(storedRecords())).toEqual(Object.keys(records));
		expect(Object.keys(wallet.sdk.getActiveSessions())).toHaveLength(1);
	});

	// The relay keeps the wallet's goodbye, which the SDK reads only after it restored the session from storage.
	it("should end a restored session the wallet ended while the dapp was closed", async () => {
		const first = newClient({ template });
		await first.init();
		const session = await connect(first);
		await untilReachable(first, session.id);
		await first.dispose();
		await wallet.sdk.disconnectSession(wallet.session().dappPubkey);

		const second = newClient({ template });
		const disconnected = vi.fn();
		second.on("session:disconnected", disconnected);
		await second.init();
		expect(second.sessions.has(session.id)).toBe(true);

		await until(() =>
			expect(disconnected).toHaveBeenCalledWith({
				sessionId: session.id,
				reason: "wallet",
			}),
		);
		expect(disconnected).toHaveBeenCalledTimes(1);
		expect(second.sessions.size).toBe(0);
		await until(() => expect(storedRecords()).toEqual({}));
		await until(() => expect(relay.openSockets()).toBe(1));
	});

	it("should end, and not restore, a session paired with another template", async () => {
		const first = newClient({ template });
		await first.init();
		const session = await connect(first);
		await untilReachable(first, session.id);
		const { dappPubkey } = wallet.session();
		await first.dispose();

		const second = newClient({
			template: { ...template, name: "Loopback, changed" },
		});
		const connected = vi.fn();
		second.on("session:connected", connected);
		await second.init();

		expect(second.sessions.size).toBe(0);
		await until(() => expect(wallet.deleted).toEqual([dappPubkey]));
		expect(wallet.sdk.getActiveSessions()).toEqual({});
		await until(() => expect(storedRecords()).toEqual({}));
		await until(() => expect(relay.openSockets()).toBe(1));
		expect(connected).not.toHaveBeenCalled();
	});

	it("should keep the record of a session while the relay cannot be reached, and restore it at the next load", async () => {
		const first = newClient({ template });
		await first.init();
		const session = await connect(first);
		await untilReachable(first, session.id);
		await first.dispose();
		const records = storedRecords();

		relay.refuse();
		const second = newClient({ template });
		const failed = vi.fn();
		second.on("client:error", failed);
		await second.init();

		expect(second.sessions.size).toBe(0);
		expect(failed).toHaveBeenCalledTimes(1);
		expect(failed).toHaveBeenCalledWith({
			error: expect.objectContaining({ code: "TRANSPORT" }),
		});
		expect(storedRecords()).toEqual(records);
		expect(relay.openSockets()).toBe(1);
		await second.dispose();

		relay.accept();
		const third = newClient({ template });
		await third.init();

		expect(third.sessions.has(session.id)).toBe(true);
		await untilReachable(third, session.id);
	});

	it("should keep a session paired with another template until a load can tell the wallet it ended", async () => {
		const first = newClient({ template });
		await first.init();
		const session = await connect(first);
		await untilReachable(first, session.id);
		const { dappPubkey } = wallet.session();
		await first.dispose();
		const records = storedRecords();
		const changed = { ...template, name: "Loopback, changed" };

		relay.refuse();
		const second = newClient({ template: changed });
		await second.init();

		expect(second.sessions.size).toBe(0);
		await until(() =>
			expect(logger.warn).toHaveBeenCalledWith(
				"Ending the CashConnect session failed",
				expect.anything(),
			),
		);
		expect(storedRecords()).toEqual(records);
		expect(Object.keys(wallet.sdk.getActiveSessions())).toEqual([dappPubkey]);
		expect(relay.openSockets()).toBe(1);
		await second.dispose();

		relay.accept();
		const third = newClient({ template: changed });
		await third.init();

		expect(third.sessions.size).toBe(0);
		await until(() => expect(wallet.deleted).toEqual([dappPubkey]));
		await until(() => expect(storedRecords()).toEqual({}));
		await until(() => expect(relay.openSockets()).toBe(1));
	});
});

describe("dispose", () => {
	it("should leave no timer and no connection, and keep the session for the next load", async () => {
		vi.useFakeTimers(timers);
		const client = newClient({ template });
		await client.init();
		const session = await connect(client);
		await untilReachable(client, session.id);
		// The SDK's relay heartbeat and its ping of the wallet.
		expect(vi.getTimerCount()).toBe(2);
		expect(relay.openSockets()).toBe(2);
		const records = storedRecords();

		await client.dispose();

		expect(vi.getTimerCount()).toBe(0);
		expect(relay.openSockets()).toBe(1);
		const published = relay.events.length;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(relay.events).toHaveLength(published);
		expect(relay.urls).toHaveLength(2);
		expect(storedRecords()).toEqual(records);
		expect(Object.keys(wallet.sdk.getActiveSessions())).toHaveLength(1);
	});
});
