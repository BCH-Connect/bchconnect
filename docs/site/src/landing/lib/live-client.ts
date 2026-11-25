// The hero's real client: the WalletConnect connector and the built-in modal.
// Loaded on demand, so the landing's first paint carries none of it.

import type { WalletConnect } from "@bchconnect/connector-walletconnect";
import type { Client } from "@bchconnect/core";
import { siteMode } from "./modal-demo";

const projectId: string | undefined = import.meta.env.VITE_REOWN_PROJECT_ID;

/** False when the build has no project id, so the hero keeps its button disabled. */
export const liveConnectEnabled = projectId !== undefined && projectId !== "";

export type LiveClient = Client<WalletConnect>;

let client: Promise<LiveClient> | null = null;

const LOOK = { accent: "violet" } as const;

/**
 * Creates the client once and restores the previous visit's session. The
 * modal offers only the protocols of the connectors passed here.
 */
export function loadClient(): Promise<LiveClient> {
	if (client !== null) return client;
	const loading = (async () => {
		const [{ createClient }, { walletConnect }, { bchconnectModal }] =
			await Promise.all([
				import("@bchconnect/core"),
				import("@bchconnect/connector-walletconnect"),
				import("@bchconnect/ui/modal"),
			]);
		const ui = bchconnectModal();
		const instance = createClient({
			connectors: [walletConnect({ projectId: projectId ?? "" })],
			network: "mainnet",
			appMetadata: {
				name: "BCH Connect",
				url: window.location.origin,
				description: "Wallet connection for Bitcoin Cash dapps.",
			},
			ui,
		});
		await instance.init();
		// The theme switch toggles `<html>`'s class, which `siteMode()` reads. Observed
		// only after a successful load, so a retried load leaves no observer behind.
		const followSite = () => ui.setTheme({ ...LOOK, mode: siteMode() });
		followSite();
		new MutationObserver(followSite).observe(document.documentElement, {
			attributeFilter: ["class"],
		});
		return instance;
	})();
	client = loading;
	// A failed load is retried on the next intent instead of staying cached.
	loading.catch(() => {
		client = null;
	});
	return loading;
}
