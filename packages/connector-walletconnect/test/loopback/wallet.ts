import type * as Sdk from "@walletconnect/sign-client";
import { vi } from "vitest";

/** The real sign client, past any mock the test file installs. */
export async function realSignClient(): Promise<typeof Sdk.SignClient> {
	const sdk = await vi.importActual<typeof Sdk>("@walletconnect/sign-client");
	return sdk.SignClient;
}

/** A started sign client. */
export type SignClientInstance = Awaited<
	ReturnType<typeof Sdk.SignClient.init>
>;

/** The storage a sign client keeps its state in. */
export type SdkStorage = NonNullable<
	NonNullable<Parameters<typeof Sdk.SignClient.init>[0]>["storage"]
>;

/** A sign client storage held in memory, so the SDK never writes to disk. */
export function memoryStorage(): SdkStorage {
	const items = new Map<string, unknown>();
	return {
		async getKeys() {
			return [...items.keys()];
		},
		async getEntries<T>() {
			return [...items].map(([key, value]): [string, T] => [
				key,
				structuredClone(value) as T,
			]);
		},
		async getItem<T>(key: string) {
			const value = items.get(key);
			return value === undefined ? undefined : (structuredClone(value) as T);
		},
		async setItem<T>(key: string, value: T) {
			items.set(key, structuredClone(value));
		},
		async removeItem(key: string) {
			items.delete(key);
		},
	};
}

/** A session proposal as the wallet received it. */
export interface ReceivedProposal {
	readonly id: number;
	readonly requiredNamespaces: unknown;
	readonly optionalNamespaces: unknown;
}

/** A request as the wallet received it. */
export interface ReceivedRequest {
	readonly id: number;
	readonly topic: string;
	readonly chainId: string;
	readonly method: string;
	readonly params: unknown;
	readonly expiryTimestamp: number | undefined;
}

/** A wallet on the real SDK that records what reaches it. */
export interface Wallet {
	readonly sdk: SignClientInstance;
	readonly proposals: readonly ReceivedProposal[];
	readonly requests: readonly ReceivedRequest[];
	/** Topics of the sessions the dapp ended. */
	readonly deleted: readonly string[];
	close(): Promise<void>;
}

export const walletAccount =
	"bch:bchtest:qq4sh33hxw2v23g2hwmcp369tany3x73wuveuzrdz5";
export const secondAccount =
	"bch:bchtest:qr4yscpw9jgq8ltajfeknpj32kamkf9knujffcdhyq";

/** What a wallet approves on chipnet; by default one account and the three proposed methods. */
export function approvedNamespaces(
	options: {
		readonly methods?: readonly string[];
		readonly accounts?: readonly string[];
	} = {},
) {
	return {
		bch: {
			accounts: [...(options.accounts ?? [walletAccount])],
			chains: ["bch:bchtest"],
			methods: [
				...(options.methods ?? [
					"bch_getAddresses",
					"bch_signTransaction",
					"bch_signMessage",
				]),
			],
			events: ["addressesChanged"],
		},
	};
}

export const walletMetadata = {
	name: "Fake Wallet",
	description: "A wallet for tests",
	url: "https://wallet.example",
	icons: ["https://wallet.example/icon.png"],
};

/** Starts a wallet connected to `relayUrl`. */
export async function startWallet(relayUrl: string): Promise<Wallet> {
	const SignClient = await realSignClient();
	const sdk = await SignClient.init({
		relayUrl,
		projectId: "0".repeat(32),
		storage: memoryStorage(),
		customStoragePrefix: "wallet",
		logger: "silent",
		telemetryEnabled: false,
		metadata: walletMetadata,
	});
	const proposals: ReceivedProposal[] = [];
	const requests: ReceivedRequest[] = [];
	const deleted: string[] = [];
	sdk.on("session_proposal", ({ id, params }) => {
		proposals.push({
			id,
			requiredNamespaces: params.requiredNamespaces,
			optionalNamespaces: params.optionalNamespaces,
		});
	});
	sdk.on("session_request", ({ id, topic, params }) => {
		const requestParams: unknown = params.request.params;
		requests.push({
			id,
			topic,
			chainId: params.chainId,
			method: params.request.method,
			params: requestParams,
			expiryTimestamp: params.request.expiryTimestamp,
		});
	});
	sdk.on("session_delete", ({ topic }) => {
		deleted.push(topic);
	});
	return {
		sdk,
		proposals,
		requests,
		deleted,
		close: () => sdk.core.relayer.transportClose(),
	};
}
