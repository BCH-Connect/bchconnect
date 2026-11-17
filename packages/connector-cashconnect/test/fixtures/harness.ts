import {
	type AppMetadata,
	type Connector,
	type ConnectorContext,
	type KeyValueStore,
	memory,
	type Network,
	type Pairing,
	type Session,
} from "@bchconnect/core";
import { Hasher } from "@cashconnect-js/core/primitives";
import { expect, type Mock, vi } from "vitest";
import { cashConnect } from "../../src/connector.js";
import { toTemplateHash } from "../../src/store.js";
import type { CashConnectTemplate } from "../../src/template.js";
import type {
	CashConnect,
	CashConnectChain,
	CashConnectConfig,
} from "../../src/types.js";
import { type FakeDapp, fakeSdk, WALLET } from "./dapp.js";
import { type SpyLogger, spyLogger } from "./logger.js";

/** A template with one resolve-only action whose values need encoding. */
export const template = {
	name: "Harness",
	actions: {
		echo: {
			params: {
				text: { type: "string", name: "Text" },
				amount: { type: "satoshis", name: "Amount" },
			},
			instructions: [
				{ type: "resolve", payload: { text: "<text>", total: "<amount>" } },
			],
			returns: {
				text: { type: "string", name: "Text" },
				total: { type: "number", name: "Total" },
			},
		},
	},
} as const satisfies CashConnectTemplate;

/** The protocol as the harness connector implements it. */
export type TestCashConnect = CashConnect<typeof template>;

/** A connector after `setup()`, with everything it was handed. */
export interface Harness {
	readonly connector: Connector<TestCashConnect>;
	readonly storage: KeyValueStore;
	readonly logger: SpyLogger;
	readonly emit: Mock<ConnectorContext["emit"]>;
}

/** What {@link harness} can change. */
export interface HarnessOptions {
	readonly network?: Network;
	readonly config?: Partial<CashConnectConfig<typeof template>>;
	readonly appMetadata?: AppMetadata;
	readonly storage?: KeyValueStore;
}

export const appMetadata: AppMetadata = {
	name: "Demo dapp",
	url: "https://dapp.example",
};

/** Builds a connector and runs its `setup()` the way the client does. */
export async function harness(options: HarnessOptions = {}): Promise<Harness> {
	const storage = options.storage ?? memory();
	const logger = spyLogger();
	const emit = vi.fn<ConnectorContext["emit"]>();
	const connector = cashConnect({ template, ...options.config });
	await connector.setup?.({
		storage,
		network: options.network ?? "chipnet",
		appMetadata: options.appMetadata ?? appMetadata,
		logger,
		emit,
	});
	return { connector, storage, logger, emit };
}

/** Waits for every pending promise job and one timer turn. */
export function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The slots in the connector's session index. */
export async function storedSlots(storage: KeyValueStore): Promise<unknown> {
	const raw = await storage.get("sessions");
	return raw === undefined ? [] : JSON.parse(raw).slots;
}

/** The record stored for `slot`, parsed. */
export async function storedRecord(
	storage: KeyValueStore,
	slot: string,
): Promise<unknown> {
	const raw = await storage.get(`slot:${slot}`);
	return raw === undefined ? undefined : JSON.parse(raw);
}

/** What {@link seed} can change in the record it writes. */
export interface SeedOptions {
	readonly chain?: CashConnectChain;
	readonly template?: CashConnectTemplate;
	readonly walletPubkey?: string;
	readonly allowedTokens?: readonly string[];
}

/** Writes the record of a paired session under `slot`, as a previous page load left it. */
export async function seed(
	storage: KeyValueStore,
	slot: string,
	options: SeedOptions = {},
): Promise<void> {
	const raw = await storage.get("sessions");
	const slots: string[] = raw === undefined ? [] : JSON.parse(raw).slots;
	await storage.set(
		"sessions",
		JSON.stringify({ v: 1, slots: [...slots, slot] }),
	);
	await storage.set(
		`slot:${slot}`,
		JSON.stringify({
			v: 1,
			chain: options.chain ?? "bchtest",
			template: toTemplateHash(Hasher, options.template ?? template),
			state: {
				privateKeyHex: "11".repeat(32),
				walletPubkey: options.walletPubkey ?? WALLET,
				allowedTokens: options.allowedTokens ?? [],
				lastEventTimestamp: 1_731_800_000,
			},
		}),
	);
}

/** The instance the connector built for `slot`. */
export function dappOf(slot: string): FakeDapp {
	const dapp = fakeSdk.dapps.find((item) => item.options.sessionKey === slot);
	if (dapp === undefined) throw new Error(`No instance for slot "${slot}"`);
	return dapp;
}

/** A `connect()` in flight, with what it handed to `onPairing`. */
export interface Connecting {
	readonly result: Promise<Session<TestCashConnect>>;
	readonly controller: AbortController;
	readonly pairings: Pairing[];
	/** The instance the connector built for this attempt. */
	readonly dapp: FakeDapp;
}

/** Starts `connect()` with a signal and waits until its instance exists. */
export async function beginConnect(h: Harness): Promise<Connecting> {
	const controller = new AbortController();
	const pairings: Pairing[] = [];
	const before = fakeSdk.dapps.length;
	const result = h.connector.connect({
		signal: controller.signal,
		onPairing: (pairing) => pairings.push(pairing),
	});
	// Tests assert on `result` later; this keeps an early rejection from being reported as unhandled.
	result.catch(() => {});
	await vi.waitFor(() => expect(fakeSdk.dapps.length).toBe(before + 1), {
		interval: 1,
	});
	const dapp = fakeSdk.dapps[before];
	if (dapp === undefined) throw new Error("No instance was built");
	return { result, controller, pairings, dapp };
}

/** Starts `connect()` and waits until it is waiting for the wallet. */
export async function startConnect(h: Harness): Promise<Connecting> {
	const connecting = await beginConnect(h);
	await vi.waitFor(() => expect(connecting.dapp.pairingPending).toBe(true), {
		interval: 1,
	});
	return connecting;
}

/** A session the wallet approved, with the instance that holds it. */
export interface Connected {
	readonly session: Session<TestCashConnect>;
	readonly dapp: FakeDapp;
}

/** Connects a session the wallet approves under `walletPubkey`. */
export async function connected(
	h: Harness,
	walletPubkey: string = WALLET,
	allowedTokens?: string[],
): Promise<Connected> {
	const { result, dapp } = await startConnect(h);
	await dapp.approve(walletPubkey, allowedTokens);
	return { session: await result, dapp };
}
