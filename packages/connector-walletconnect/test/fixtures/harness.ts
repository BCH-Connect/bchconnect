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
import { expect, type Mock, vi } from "vitest";
import { walletConnect } from "../../src/connector.js";
import type { SdkSession } from "../../src/sdk.js";
import type { WalletConnect, WalletConnectConfig } from "../../src/types.js";
import { type SpyLogger, spyLogger } from "./logger.js";
import { type FakeSignClient, fakeSdk, sdkSession } from "./sign-client.js";

/** A connector after `setup()`, with everything it was handed. */
export interface Harness {
	readonly connector: Connector<WalletConnect>;
	readonly storage: KeyValueStore;
	readonly logger: SpyLogger;
	readonly emit: Mock<ConnectorContext["emit"]>;
	/** The fake the SDK's `init()` resolves with. */
	readonly sdk: FakeSignClient;
}

/** What {@link harness} can change. */
export interface HarnessOptions {
	readonly network?: Network;
	readonly config?: Partial<WalletConnectConfig>;
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
	const connector = walletConnect({
		projectId: "project-1",
		...options.config,
	});
	await connector.setup?.({
		storage,
		network: options.network ?? "chipnet",
		appMetadata: options.appMetadata ?? appMetadata,
		logger,
		emit,
	});
	return { connector, storage, logger, emit, sdk: fakeSdk.client };
}

/** Waits for every pending promise job and one timer turn. */
export function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The topics in the connector's session record. */
export async function recordedTopics(storage: KeyValueStore): Promise<unknown> {
	const raw = await storage.get("sessions");
	return raw === undefined ? [] : JSON.parse(raw).topics;
}

/** A `connect()` in flight, with what it handed to `onPairing`. */
export interface Connecting {
	readonly result: Promise<Session<WalletConnect>>;
	readonly controller: AbortController;
	readonly pairings: Pairing[];
}

/** Starts `connect()` with a signal and waits until its proposal is out. */
export async function startConnect(h: Harness): Promise<Connecting> {
	const controller = new AbortController();
	const pairings: Pairing[] = [];
	const before = h.sdk.proposals.length;
	const result = h.connector.connect({
		signal: controller.signal,
		onPairing: (pairing) => pairings.push(pairing),
	});
	// Tests assert on `result` later; this keeps an early rejection from being reported as unhandled.
	result.catch(() => {});
	await vi.waitFor(() => expect(h.sdk.proposals.length).toBe(before + 1));
	return { result, controller, pairings };
}

/** Connects a session the wallet approves as `raw`. */
export async function connected(
	h: Harness,
	raw: SdkSession = sdkSession(),
): Promise<Session<WalletConnect>> {
	h.sdk.relayer.connected = true;
	const { result } = await startConnect(h);
	h.sdk.proposals.at(-1)?.approve(raw);
	return result;
}
