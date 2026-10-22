import type { DemoProtocol } from "@bchconnect/test-utils";
import {
	createFakeConnector,
	demoCapabilities,
	demoMetadata,
	demoSession,
} from "@bchconnect/test-utils";
import { describe, expect, it } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import {
	CapabilityMissingError,
	ConfigError,
	SessionMissingError,
} from "../../src/errors.js";
import { signTransaction } from "../../src/helpers/sign-transaction.js";
import type { LifecycleEvents } from "../../src/types/client.js";
import type {
	SignTransactionRequest,
	TransactionOutput,
} from "../../src/types/transaction.js";

const appMetadata = { name: "Test", url: "https://example.com" };
const req: SignTransactionRequest = { transaction: "0200", sourceOutputs: [] };
const output: TransactionOutput = {
	lockingBytecode: new Uint8Array([0x6a]),
	valueSatoshis: 1_000n,
};

function withOutput(overrides: Partial<TransactionOutput>) {
	return {
		transaction: {
			version: 2,
			locktime: 0,
			inputs: [],
			outputs: [output, { ...output, ...overrides }],
		},
		sourceOutputs: [],
	} satisfies SignTransactionRequest;
}

const signed = { signedTransaction: "02", signedTransactionHash: "ab" };

async function setup(
	capabilities: readonly DemoProtocol["capability"][] = ["libauth-signing"],
) {
	const session = demoSession({ id: "s1" });
	const connector = createFakeConnector<DemoProtocol>({
		protocol: "demo",
		restore: [session],
		metadata: demoMetadata,
		capabilities,
		interfaces: demoCapabilities,
		methods: { sign_transaction: async () => signed },
	});
	const client = createClient({
		connectors: [connector],
		network: "chipnet",
		appMetadata,
	});
	await client.init();

	return { client, connector, session };
}

describe("signTransaction", () => {
	it("should sign a transaction through the client's request", async () => {
		const { client, connector, session } = await setup();
		const events: LifecycleEvents["request:settled"][] = [];
		client.on("request:settled", (payload) => events.push(payload));

		const result = await signTransaction(client, session, req, {
			id: "r1",
			timeoutMs: 1_000,
		});

		expect(result).toEqual(signed);
		expect(connector.calls).toEqual([
			expect.objectContaining({
				sessionId: session.id,
				method: "sign_transaction",
				params: { transaction: req },
				opts: expect.objectContaining({ id: "r1", timeoutMs: 1_000 }),
			}),
		]);
		expect(events).toEqual([
			{ id: "r1", sessionId: session.id, outcome: "resolved" },
		]);
	});

	it("should forward the caller's signal", async () => {
		const { client, connector, session } = await setup();
		const controller = new AbortController();
		controller.abort();

		await expect(
			signTransaction(client, session, req, { signal: controller.signal }),
		).rejects.toMatchObject({ code: "ABORTED" });
		expect(connector.calls).toEqual([]);
	});

	it("should reject CAPABILITY_MISSING when the session lacks the capability", async () => {
		const { client, connector, session } = await setup(["message-signing"]);

		const failure = signTransaction(client, session, req);

		await expect(failure).rejects.toThrow(CapabilityMissingError);
		await expect(failure).rejects.toMatchObject({
			code: "CAPABILITY_MISSING",
			sessionId: session.id,
		});
		expect(connector.calls).toEqual([]);
	});

	it("should reject SESSION_MISSING for a session no longer connected", async () => {
		const { client, connector, session } = await setup();
		await client.disconnect(session);

		await expect(signTransaction(client, session, req)).rejects.toThrow(
			SessionMissingError,
		);
		expect(connector.calls).toEqual([]);
	});

	it("should reject CONFIG for an output value below zero", async () => {
		const { client, connector, session } = await setup();

		const failure = signTransaction(
			client,
			session,
			withOutput({ valueSatoshis: -1n }),
		);

		await expect(failure).rejects.toThrow(ConfigError);
		await expect(failure).rejects.toMatchObject({ code: "CONFIG" });
		expect(connector.calls).toEqual([]);
	});

	it("should reject CONFIG for an output value above 21 million BCH", async () => {
		const { client, connector, session } = await setup();

		const failure = signTransaction(
			client,
			session,
			withOutput({ valueSatoshis: 2_100_000_000_000_001n }),
		);

		await expect(failure).rejects.toThrow(ConfigError);
		await expect(failure).rejects.toMatchObject({ code: "CONFIG" });
		expect(connector.calls).toEqual([]);
	});

	it("should reject CONFIG for a negative token amount", async () => {
		const { client, connector, session } = await setup();

		const failure = signTransaction(
			client,
			session,
			withOutput({
				token: { amount: -1n, category: new Uint8Array(32) },
			}),
		);

		await expect(failure).rejects.toThrow(ConfigError);
		await expect(failure).rejects.toMatchObject({ code: "CONFIG" });
		expect(connector.calls).toEqual([]);
	});

	it("should reject SESSION_MISSING before checking amounts", async () => {
		const { client, connector, session } = await setup();
		await client.disconnect(session);

		await expect(
			signTransaction(client, session, withOutput({ valueSatoshis: -1n })),
		).rejects.toThrow(SessionMissingError);
		expect(connector.calls).toEqual([]);
	});
});
