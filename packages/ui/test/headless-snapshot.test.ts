import {
	cookieStorage,
	createClient,
	type KeyValueStore,
	type LifecycleEvents,
	type ProtocolDefinition,
	type Session,
	type WalletIdentity,
} from "@bchconnect/core";
import { createFakeConnector, fakeSession } from "@bchconnect/test-utils";
import { describe, expect, it } from "vitest";
import { headlessModal, type ModalRenderer } from "../src/headless.ts";

// A protocol that sends no wallet identity on the wire.
interface WireProtocol extends ProtocolDefinition {
	id: "cashconnect";
	session: Record<string, never>;
	methods: Record<never, never>;
	events: Record<never, never>;
	capability: never;
}

const renderer: ModalRenderer = {
	open() {},
	update() {},
	async close() {},
};

// Lets queued storage writes run.
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

async function connectThroughModal(wallet?: WalletIdentity) {
	// Records what reached the cookie, after its size check passed.
	const cookies = cookieStorage();
	const saved: string[] = [];
	const storage: KeyValueStore = {
		get: (key) => cookies.get(key),
		async set(key, value) {
			await cookies.set(key, value);
			saved.push(value);
		},
		delete: (key) => cookies.delete(key),
	};
	const client = createClient({
		connectors: [
			createFakeConnector<WireProtocol>({
				protocol: "cashconnect",
				session: fakeSession<WireProtocol>({
					id: "s1",
					protocol: "cashconnect",
					data: {},
					...(wallet === undefined ? {} : { wallet }),
				}),
			}),
		],
		network: "mainnet",
		appMetadata: { name: "Test", url: "https://example.com" },
		storage,
		ui: headlessModal(renderer),
	});
	const errors: LifecycleEvents["client:error"][] = [];
	client.on("client:error", (payload) => errors.push(payload));
	await client.init();

	const session: Session = await client.connect();
	await settle();
	return { session, errors, saved: saved.at(-1) };
}

describe("headlessModal under cookieStorage", () => {
	it("should save the session of a wallet the protocol leaves unnamed", async () => {
		const { session, errors, saved } = await connectThroughModal();

		expect(errors).toEqual([]);
		expect(session.wallet).toEqual({
			id: "cashonize",
			name: "Cashonize",
			source: "selection",
		});
		expect(saved).toContain('"id":"s1"');
	});

	it("should save a wallet's own identity when the protocol names it", async () => {
		const wallet: WalletIdentity = {
			name: "Paytaca",
			icon: "https://paytaca.com/icon.png",
			source: "protocol",
		};

		const { session, errors, saved } = await connectThroughModal(wallet);

		expect(errors).toEqual([]);
		expect(session.wallet).toEqual(wallet);
		expect(saved).toContain('"icon":"https://paytaca.com/icon.png"');
	});
});
