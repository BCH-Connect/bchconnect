// Every word on the landing lives here, so copy changes never touch layout code.

import type { ProtocolId } from "@bchconnect/ui";

export const SITE_URL = "https://bchconnect.dev";

export const HERO = {
	headline: "Connect every Bitcoin Cash wallet.",
	lede: "One typed client for WizardConnect, WalletConnect and CashConnect, with a connect modal ready to ship. For any JavaScript framework, or none.",
	primaryAction: "Get started",
	secondaryAction: "View on GitHub",
} as const;

export const START = {
	label: "Start with",
	tabs: { install: "Install", prompt: "Prompt" },
	/** The umbrella package: core, connectors and the modal in one install. */
	install: "npm i bchconnect",
	copy: "Copy",
	copied: "Copied",
	copyInstall: "Copy install command",
	copyPrompt: "Copy prompt",
	/** Names the prompt on the panel; the popover shows the prompt itself. */
	promptLabel: "Prompt for your coding agent",
} as const;

export const CONNECT = {
	action: "Connect wallet",
	failed: "The modal could not load. Try again.",
	copyAddress: "Copy address",
	addressCopied: "Address copied",
	disconnect: "Disconnect",
	/** Announced when the demo session starts. */
	connectedTo: (wallet: string) => `Connected to ${wallet}`,
} as const;

/** Shown as the prompt's heading and copied as its first line. */
export const AGENT_PROMPT_TITLE =
	"Add wallet connection to my dapp with BCH Connect.";

export const AGENT_PROMPT_BODY = `Read ${SITE_URL}/llms.txt first. Install bchconnect, create one client with the WizardConnect, WalletConnect and CashConnect connectors, and use the default connect modal unless I ask for a custom interface. Every documentation page is also available as Markdown by adding .md to its URL. Before writing code, ask me which framework I use and which protocols I need to support.`;

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
		id: "walletconnect",
		name: "WalletConnect",
		mark: "/marks/walletconnect.svg",
	},
	{
		id: "cashconnect",
		name: "CashConnect",
		mark: "/marks/cashconnect.webp",
	},
];

/** The address the demo session reports. Not a real wallet's. */
export const DEMO_ADDRESS =
	"bitcoincash:qzm5ct0v7aqn2pxsl8g4hjmzzu9w6ydp4k3yf0e7rs";

export const FOOTER = {
	copyright: "© BCH Connect contributors",
} as const;
