// Every word on the landing lives here, so copy changes never touch layout code.

import type { ProtocolId } from "@bchconnect/ui";
import { repoUrl } from "@/lib/shared";

export const SITE_URL = "https://bchconnect.dev";

export const HERO = {
	headline: "Connect every Bitcoin Cash wallet.",
	lede: "Reliable BCH wallet connections out of the box, through one type-safe API for any connection protocol and your favorite JS framework.",
	primaryAction: "Get started",
	secondaryAction: "View on GitHub",
} as const;

export const FEATURES = {
	title: "Wallet connection handled reliably, out of the box",
	lede: "One library owns the wallet layer of your dapp, so your time goes to your product and your contracts.",
	protocols: {
		title: "Any connection protocol, out of the box",
		body: "BCH Connect is protocol-agnostic. Each connection follows the same session model, so your app doesn't need a separate integration path for every protocol.",
		detail: "You then branch on the capabilities of the current session.",
		files: { config: "client.ts", capabilities: "sign.ts" },
		link: "Compare the protocols",
	},
	interface: {
		title: "Beautiful built-in UI or fully headless",
		tabs: { builtIn: "Built-in", headless: "Headless" },
		builtIn:
			"The connect modal is a web component that just works out of the box. It ships fully localized, with every string available to override. You can also use the UI package on its own, without BCH Connect core or connectors.",
		headless:
			"Or skip the built-in modal and build your own experience. Use BCH Connect's connection state in your own components, with full control over markup, styling, and interactions.",
		accent: "Accent",
		radius: "Radius",
		yoursNote: "Your markup, your styles. The library only hands it state.",
		yoursBrand: "MY CUSTOM UI",
		yoursTitle: "Pick a wallet",
		yoursIdle: "Ready",
		yoursPending: "Approve in your wallet",
		yoursDone: "Connected",
	},
	types: {
		title: "Typed from end to end",
		body: "Written in TypeScript, for TypeScript. Sessions narrow by protocol, every reply from a wallet is checked before it reaches your types, and nothing stops you from holding more than one at a time.",
	},
	frameworks: {
		title: "Framework-agnostic, with support for SSR",
		body: "Plain TypeScript with no framework assumptions, so it fits any stack. Sessions restore from cookies, so pages rendered on the server already know who is connected.",
	},
} as const;

export const START = {
	label: "Start with",
	tabs: { install: "Install", prompt: "Prompt" },
	install: "npm i @bchconnect/core @bchconnect/ui",
	copy: "Copy",
	copied: "Copied",
	copyInstall: "Copy install command",
	copyPrompt: "Copy prompt",
	/** Names the prompt on the panel; the popover shows the prompt itself. */
	promptLabel: "Prompt for your coding agent",
} as const;

export const CONNECT = {
	action: "Connect wallet",
	disabledHint: "Live wallet connections are coming soon",
} as const;

/** Shown as the prompt's heading and copied as its first line. */
export const AGENT_PROMPT_TITLE =
	"Add wallet connection to my dapp with BCH Connect.";

export const AGENT_PROMPT_BODY = `Read ${SITE_URL}/llms.txt first. Install @bchconnect/core, @bchconnect/ui and the connector package for each protocol I need, create one client with those connectors, and use the built-in modal from @bchconnect/ui/modal unless I ask for a custom interface. Every documentation page is also available as Markdown by adding .md to its URL. Before writing code, ask me which framework I use and which protocols I need to support.`;

export const AGENT_PROMPT = `${AGENT_PROMPT_TITLE}\n\n${AGENT_PROMPT_BODY}`;

export interface ProtocolContent {
	readonly id: ProtocolId;
	readonly name: string;
	readonly mark: string;
}

export const PROTOCOLS: readonly ProtocolContent[] = [
	{
		id: "wizardconnect",
		name: "WizardConnect",
		mark: "/marks/wizardconnect.webp",
	},
	{
		id: "bch-wc2",
		name: "WalletConnect",
		mark: "/marks/walletconnect.svg",
	},
	{
		id: "cashconnect",
		name: "CashConnect",
		mark: "/marks/cashconnect.webp",
	},
];

export const CLOSE = {
	title: "Set up once, then move on.",
	lede: "Wallet connection stays solved and working, so your time goes to business logic and contracts. Start with the guide, or hand the setup to your coding agent.",
	action: "Get started",
} as const;

/** A docs page by its path under /docs, or any other address by `href`. */
export type FooterLink =
	| { readonly label: string; readonly doc: string }
	| { readonly label: string; readonly href: string };

export interface FooterGroup {
	readonly title: string;
	readonly links: readonly FooterLink[];
}

export const FOOTER = {
	tagline: "Wallet connection for Bitcoin Cash dapps.",
	groups: [
		{
			title: "Docs",
			links: [
				{ label: "Introduction", doc: "" },
				{ label: "Concepts", doc: "concepts" },
				{ label: "Connectors", doc: "connectors" },
				{ label: "Interface", doc: "ui" },
				{ label: "API reference", doc: "reference" },
			],
		},
		{
			title: "Project",
			links: [
				{ label: "GitHub", href: repoUrl },
				{ label: "Issues", href: `${repoUrl}/issues` },
				{ label: "License", href: `${repoUrl}/blob/main/LICENSE` },
			],
		},
		{
			title: "For agents",
			links: [
				{ label: "llms.txt", href: "/llms.txt" },
				{ label: "llms-full.txt", href: "/llms-full.txt" },
			],
		},
	] satisfies readonly FooterGroup[],
	license: "Released under the MIT License.",
	copyright: "© 2026 BCH Connect contributors",
	mark: "BCH Connect",
} as const;
