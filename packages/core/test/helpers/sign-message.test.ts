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
	SessionMissingError,
} from "../../src/errors.js";
import { signMessage } from "../../src/helpers/sign-message.js";
import type { LifecycleEvents } from "../../src/types/client.js";
import type { SignMessageRequest } from "../../src/types/transaction.js";

const appMetadata = { name: "Test", url: "https://example.com" };
const req: SignMessageRequest = { message: "hello" };
const signed = "signature";

async function setup(
	capabilities: readonly DemoProtocol["capability"][] = ["message-signing"],
) {
	const session = demoSession({ id: "s1" });
	const connector = createFakeConnector<DemoProtocol>({
		protocol: "demo",
		restore: [session],
		metadata: demoMetadata,
		capabilities,
		interfaces: demoCapabilities,
		methods: { sign_message: async () => signed },
	});
	const client = createClient({
		connectors: [connector],
		network: "chipnet",
		appMetadata,
	});
	await client.init();

	return { client, connector, session };
}

describe("signMessage", () => {
	it("should sign a message through the client's request", async () => {
		const { client, connector, session } = await setup();
		const events: LifecycleEvents["request:settled"][] = [];
		client.on("request:settled", (payload) => events.push(payload));

		const result = await signMessage(client, session, req, {
			id: "r1",
			timeoutMs: 1_000,
		});

		expect(result).toEqual(signed);
		expect(connector.calls).toEqual([
			expect.objectContaining({
				sessionId: session.id,
				method: "sign_message",
				params: req,
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
			signMessage(client, session, req, { signal: controller.signal }),
		).rejects.toMatchObject({ code: "ABORTED" });
		expect(connector.calls).toEqual([]);
	});

	it("should reject CAPABILITY_MISSING when the session lacks the capability", async () => {
		const { client, connector, session } = await setup(["libauth-signing"]);

		const failure = signMessage(client, session, req);

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

		await expect(signMessage(client, session, req)).rejects.toThrow(
			SessionMissingError,
		);
		expect(connector.calls).toEqual([]);
	});
});
