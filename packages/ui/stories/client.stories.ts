// The out-of-the-box path (SPEC §8.9): a client with `ui: bchconnectModal()`
// connects with `client.connect()` alone, against a scripted connector.

import {
	type Connector,
	createClient,
	memory,
	type Session,
} from "@bchconnect/core";
import { html } from "lit";
import { expect, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { bchconnectModal } from "../src/bchconnect-modal.ts";
import { PROTOCOL_LINKS } from "./fixtures.ts";
import { settle } from "./settle.ts";

// A WizardConnect connector whose pairing the story approves or ignores.
function scriptedConnector() {
	let approve: (session: Session) => void = () => {};
	const connector: Connector = {
		protocol: "wizardconnect",
		async connect(opts) {
			opts.onPairing?.({ kind: "uri", uri: PROTOCOL_LINKS.wizardconnect });
			return new Promise((resolve, reject) => {
				approve = resolve;
				opts.signal?.addEventListener("abort", () =>
					reject(opts.signal?.reason),
				);
			});
		},
		async restore() {
			return [];
		},
		async disconnect() {},
		async request() {
			throw new Error("No methods in this story");
		},
		subscribe() {
			return () => {};
		},
		capabilitiesOf() {
			return new Set();
		},
	};
	return {
		connector,
		approve: (session: Session) => approve(session),
	};
}

async function clientWithModal() {
	const scripted = scriptedConnector();
	const client = createClient({
		connectors: [scripted.connector],
		network: "mainnet",
		appMetadata: { name: "Story", url: "https://example.com" },
		storage: memory(),
		ui: bchconnectModal(),
	});
	await client.init();
	return { client, ...scripted };
}

function mounted(tag: "bchc-modal" | "bchc-toast"): HTMLElement {
	const element = document.body.querySelector<HTMLElement>(tag);
	if (element === null) throw new Error(`${tag} is not mounted`);
	return element;
}

// An explicit empty args type: inferring one for a meta without a component trips TS2590.
const meta = preview.type<{ args: Record<string, never> }>().meta({
	title: "Client",
	// Test-only: the play drives a real client, so there is nothing to browse.
	tags: ["!dev", "!autodocs"],
	render: () => html`<p>The modal mounts on document.body.</p>`,
});

export const OutOfTheBox = meta.story({
	play: async () => {
		const { client, approve } = await clientWithModal();

		const call = client.connect();
		await waitFor(() => mounted("bchc-modal"));
		await settle();
		const shadow = mounted("bchc-modal").shadowRoot;
		await waitFor(() =>
			expect(
				shadow?.querySelector(".tile")?.classList.contains("is-initiating"),
			).toBe(false),
		);

		approve({
			id: "story",
			protocol: "wizardconnect",
			wallet: { id: "cashonize", name: "Cashonize", source: "protocol" },
			data: {},
			status: { transport: "connected", peer: "reachable" },
		});

		await expect(call).resolves.toMatchObject({ id: "story" });
		expect(document.body.querySelector("bchc-modal")).toBeNull();
		const toast = mounted("bchc-toast");
		await waitFor(() =>
			expect(toast.shadowRoot?.textContent).toContain("Cashonize"),
		);
		await settle();
		toast.remove();
		await client.dispose();
	},
});

export const Dismissed = meta.story({
	play: async () => {
		const { client } = await clientWithModal();

		const call = client.connect();
		await waitFor(() => mounted("bchc-modal"));
		await settle();
		const close = mounted("bchc-modal").shadowRoot?.querySelector<HTMLElement>(
			'[aria-label="Close"]',
		);
		if (close === null || close === undefined) {
			throw new Error("close button missing");
		}
		close.click();

		await expect(call).rejects.toMatchObject({ code: "ABORTED" });
		expect(document.body.querySelector("bchc-modal")).toBeNull();
		expect(document.body.querySelector("bchc-toast")).toBeNull();
		await client.dispose();
	},
});
