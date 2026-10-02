import { html, nothing } from "lit";
import { action } from "storybook/actions";
import preview, { resolveMode } from "../.storybook/preview.ts";
import type { ModalView } from "../src/state.ts";
import { viewFor } from "./fixtures.ts";
import { THEME_ARG_TYPES, type ThemeArgs } from "./theme.ts";

interface ModalStoryArgs extends ThemeArgs {
	readonly view: ModalView;
}

const meta = preview.type<{ args: ModalStoryArgs }>().meta({
	component: "bchc-modal",
	argTypes: THEME_ARG_TYPES,
	args: { view: viewFor() },
	render: (args, context) => html`
		<bchc-modal
			data-bchc-accent=${args.accent ?? nothing}
			data-bchc-neutral=${args.neutral ?? nothing}
			data-bchc-radius=${args.radius ?? nothing}
			data-bchc-font=${args.font ?? nothing}
			data-bchc-blur=${args.backdropBlur ?? nothing}
			data-bchc-mode=${resolveMode(context.globals)}
			.view=${args.view}
			@bchc-protocol=${action("bchc-protocol")}
			@bchc-screen=${action("bchc-screen")}
			@bchc-close=${action("bchc-close")}
			@bchc-retry=${action("bchc-retry")}
		></bchc-modal>
	`,
});

// WizardConnect on mainnet unless a story says otherwise.
export const Scan = meta.story({});

export const GettingLink = meta.story({
	args: { view: viewFor({ phase: { kind: "initiating" } }) },
});

export const Declined = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "rejected" } }) },
});

export const TimedOut = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "timeout" } }) },
});

export const Stopped = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "aborted" } }) },
});

export const Offline = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "transport" } }) },
});

export const WrongNetwork = meta.story({
	args: {
		view: viewFor({ phase: { kind: "failed", reason: "network-mismatch" } }),
	},
});

export const Unsupported = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "unsupported" } }) },
});

export const Wallets = meta.story({
	args: { view: viewFor({ screen: "wallets" }) },
});

export const WalletConnect = meta.story({
	args: { view: viewFor({ protocol: "walletconnect" }) },
});

export const CashConnect = meta.story({
	args: { view: viewFor({ protocol: "cashconnect" }) },
});

export const Chipnet = meta.story({
	args: { view: viewFor({ network: "chipnet" }) },
});

export const Regtest = meta.story({
	args: { view: viewFor({ network: "regtest" }) },
});
