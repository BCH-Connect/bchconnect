import { type Connector, createClient, type Session } from "@bchconnect/core";
import { describe, expect, it, vi } from "vitest";
import { executeAction } from "../src/execute-action.js";
import type { CashConnectActionResult } from "../src/template.js";
import { type SendTemplate, sendTemplate } from "../src/templates.js";
import type { CashConnect } from "../src/types.js";

type Send = CashConnect<SendTemplate>;

const connector: Connector<Send> = {
	protocol: "cashconnect",
	connect: () => Promise.reject(new Error("not used")),
	restore: () => Promise.resolve([]),
	disconnect: () => Promise.resolve(),
	request: () => Promise.reject(new Error("not used")),
	subscribe: () => () => {},
	capabilitiesOf: () => new Set(["template-execution"]),
};

const session: Session<Send> = {
	id: "wallet-pubkey",
	protocol: "cashconnect",
	wallet: { source: "selection" },
	data: {
		walletPubkey: "wallet-pubkey",
		chain: "bchtest",
		template: sendTemplate,
		allowedTokens: [],
	},
	status: { transport: "connected", peer: "reachable" },
};

const result: CashConnectActionResult<SendTemplate, "send"> = {
	data: { tx: new Uint8Array([1]), txHash: new Uint8Array([2]) },
	transactions: [],
	balanceChanges: { sats: -1_000n },
};

function setup() {
	const client = createClient({
		connectors: [connector],
		network: "chipnet",
		appMetadata: { name: "Test", url: "https://dapp.example" },
	});
	const request = vi.spyOn(client, "request").mockResolvedValue(result);
	return { client, request };
}

describe("executeAction", () => {
	it("should send the action and its params as an executeAction request", async () => {
		const { client, request } = setup();
		const params = { recipient: "bchtest:qrecipient", amount: 1_000n };
		const opts = { id: "r1", timeoutMs: 5_000 };

		await executeAction(client, session, "send", params, opts);

		expect(request).toHaveBeenCalledExactlyOnceWith(
			session,
			"executeAction",
			{ action: "send", params },
			opts,
		);
	});

	it("should resolve with the request's result", async () => {
		const { client } = setup();

		await expect(
			executeAction(client, session, "send", {
				recipient: "bchtest:qrecipient",
				amount: 1_000n,
			}),
		).resolves.toBe(result);
	});
});
