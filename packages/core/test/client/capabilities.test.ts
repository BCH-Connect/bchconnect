import type { DemoProtocol, FakeConnectorScript } from "@bchconnect/test-utils";
import {
	createFakeConnector,
	demoCapabilities,
	demoMetadata,
	demoSession,
} from "@bchconnect/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import { ConfigError, SessionMissingError } from "../../src/errors.js";
import type { LifecycleEvents } from "../../src/types/client.js";
import type {
	SignMessageRequest,
	SignTransactionRequest,
} from "../../src/types/transaction.js";

const appMetadata = { name: "Test", url: "https://example.com" };
const transaction: SignTransactionRequest = {
	transaction: "0200",
	sourceOutputs: [],
};
const message: SignMessageRequest = { message: "hello" };
const signed = { signedTransaction: "02", signedTransactionHash: "ab" };

async function setup(
	script: Partial<Omit<FakeConnectorScript<DemoProtocol>, "protocol">> = {},
	options: { withoutInterfaces?: true } = {},
) {
	const session = demoSession({ id: "s1" });
	const connector = createFakeConnector<DemoProtocol>({
		protocol: "demo",
		restore: [session],
		metadata: demoMetadata,
		capabilities: ["libauth-signing", "message-signing"],
		...(options.withoutInterfaces ? {} : { interfaces: demoCapabilities }),
		methods: {
			sign_transaction: async () => signed,
			sign_message: async () => "signature",
		},
		...script,
	});
	const client = createClient({
		connectors: [connector],
		network: "chipnet",
		appMetadata,
	});
	await client.init();

	return { client, connector, session };
}

function capabilityBuilds(
	connector: Awaited<ReturnType<typeof setup>>["connector"],
) {
	return connector.log.filter((entry) => entry.kind === "capabilities");
}

describe("can", () => {
	it("should answer from the connector's capabilities for the session", async () => {
		const { client, session } = await setup({
			capabilities: ["message-signing"],
		});

		expect(client.can(session, "message-signing")).toBe(true);
		expect(client.can(session, "libauth-signing")).toBe(false);
	});

	it("should ask the connector about the session in state", async () => {
		const capabilities = vi.fn(() => ["message-signing" as const]);
		const { client, connector, session } = await setup({ capabilities });
		const changed = demoSession({
			id: session.id,
			wallet: { name: "New", source: "protocol" },
		});
		connector.emit("session:changed", { session: changed, previous: session });
		const stored = client.sessions.get(session.id);

		client.can(session, "message-signing");

		expect(capabilities).toHaveBeenLastCalledWith(stored);
		expect(stored).not.toBe(session);
	});

	it("should throw SESSION_MISSING for a session not in state", async () => {
		const { client } = await setup();
		const absent = demoSession({ id: "gone" });

		expect(() => client.can(absent, "message-signing")).toThrow(
			SessionMissingError,
		);
		expect(() => client.can(absent, "message-signing")).toThrow(
			expect.objectContaining({ sessionId: "gone" }),
		);
	});

	it("should throw CONFIG after dispose", async () => {
		const { client, session } = await setup();
		await client.dispose();

		expect(() => client.can(session, "message-signing")).toThrow(ConfigError);
	});
});

describe("capability", () => {
	it("should return the connector's interface for a capability the session has", async () => {
		const { client, connector, session } = await setup();

		const signing = client.capability(session, "libauth-signing");

		expect(signing).not.toBeNull();
		expect(typeof signing?.signTransaction).toBe("function");
		expect(capabilityBuilds(connector)).toEqual([
			{ kind: "capabilities", sessionId: session.id },
		]);
	});

	it("should return null for a capability the session lacks, without building any", async () => {
		const { client, connector, session } = await setup({
			capabilities: ["message-signing"],
		});

		expect(client.capability(session, "libauth-signing")).toBeNull();
		expect(capabilityBuilds(connector)).toEqual([]);
	});

	it("should return null when the connector supplies no interfaces", async () => {
		const { client, session } = await setup({}, { withoutInterfaces: true });

		expect(client.capability(session, "libauth-signing")).toBeNull();
	});

	it("should return null when the connector leaves the capability out", async () => {
		const { client, session } = await setup({
			interfaces: (_session, { request }) => ({
				"message-signing": {
					signMessage: (req, opts) => request("sign_message", req, opts),
				},
			}),
		});

		expect(client.capability(session, "libauth-signing")).toBeNull();
		expect(client.capability(session, "message-signing")).not.toBeNull();
	});

	it("should build a session's interfaces once and keep returning them", async () => {
		const { client, connector, session } = await setup();

		const first = client.capability(session, "libauth-signing");
		const again = client.capability(session, "libauth-signing");
		client.capability(session, "message-signing");

		expect(again).toBe(first);
		expect(capabilityBuilds(connector)).toHaveLength(1);
	});

	it("should build them again for a changed session", async () => {
		const { client, connector, session } = await setup();
		const before = client.capability(session, "libauth-signing");
		const changed = demoSession({
			id: session.id,
			wallet: { name: "New", source: "protocol" },
		});

		connector.emit("session:changed", { session: changed, previous: session });
		const after = client.capability(session, "libauth-signing");

		expect(after).not.toBe(before);
		expect(capabilityBuilds(connector)).toHaveLength(2);
	});

	it("should send every call through the client's request", async () => {
		const { client, connector, session } = await setup();
		const events: LifecycleEvents["request:pending"][] = [];
		client.on("request:pending", (payload) => events.push(payload));

		const result = await client
			.capability(session, "libauth-signing")
			?.signTransaction(transaction, { id: "r1", timeoutMs: 1_000 });

		expect(result).toEqual(signed);
		expect(events).toEqual([
			{
				id: "r1",
				sessionId: session.id,
				method: "sign_transaction",
				userInteraction: true,
			},
		]);
		expect(connector.calls).toEqual([
			expect.objectContaining({
				sessionId: session.id,
				method: "sign_transaction",
				params: { transaction },
				opts: expect.objectContaining({ id: "r1", timeoutMs: 1_000 }),
			}),
		]);
	});

	it("should reject SESSION_MISSING from an interface whose session disconnected", async () => {
		const { client, connector, session } = await setup();
		const signing = client.capability(session, "message-signing");
		await client.disconnect(session);

		await expect(signing?.signMessage(message)).rejects.toThrow(
			SessionMissingError,
		);
		expect(connector.calls).toEqual([]);
	});

	it("should throw SESSION_MISSING for a session not in state", async () => {
		const { client, connector } = await setup();
		const absent = demoSession({ id: "gone" });

		expect(() => client.capability(absent, "libauth-signing")).toThrow(
			SessionMissingError,
		);
		expect(capabilityBuilds(connector)).toEqual([]);
	});

	it("should throw CONFIG after dispose", async () => {
		const { client, session } = await setup();
		await client.dispose();

		expect(() => client.capability(session, "libauth-signing")).toThrow(
			ConfigError,
		);
	});
});
