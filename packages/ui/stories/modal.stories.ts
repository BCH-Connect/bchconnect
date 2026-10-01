import preview from "../.storybook/preview.ts";
import {
	BCHC_DIRECTORY,
	BCHC_PROTOCOLS,
	BCHC_WALLETS,
} from "../src/defaults.ts";
import type { ModalView, ProtocolId, WalletOption } from "../src/state.ts";

const WALLET_HREF: Readonly<Record<string, string>> = {
	cashonize: "https://cashonize.com",
	selene: "https://selene.cash",
	paytaca: "https://paytaca.com",
	optn: "https://optn.cash",
};

function walletsFor(protocol: ProtocolId): WalletOption[] {
	return BCHC_WALLETS.filter((wallet) =>
		wallet.protocols.includes(protocol),
	).map((wallet) => ({
		id: wallet.id,
		name: wallet.name,
		logo: wallet.logo,
		href: WALLET_HREF[wallet.id] ?? null,
	}));
}

const view: ModalView = {
	screen: "connect",
	protocol: "wizardconnect",
	protocols: BCHC_PROTOCOLS,
	wallets: walletsFor("wizardconnect"),
	directory: BCHC_DIRECTORY,
	network: "mainnet",
	phase: {
		kind: "awaiting-approval",
		link: "WIZ://%3FP%3DLDT6EGH3WX8C47LZ4XFZ0EUFHUWVPMZPVHJEX4PP3ZMHD63SQFNQ%26S%3DQK7G6VT7GMDTV",
	},
};

const meta = preview.meta({
	component: "bchc-modal",
});

export const Default = meta.story({
	args: { view },
});
