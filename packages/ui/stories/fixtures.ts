import {
	BCHC_DIRECTORY,
	BCHC_PROTOCOLS,
	BCHC_WALLETS,
} from "../src/defaults.ts";
import type {
	ConnectPhase,
	ModalScreen,
	ModalView,
	Network,
	ProtocolId,
	ProtocolOption,
	WalletDirectoryEntry,
	WalletOption,
	WalletSupport,
} from "../src/state.ts";

const WALLET_HREF: Readonly<Record<string, string>> = {
	cashonize: "https://cashonize.com",
	selene: "https://selene.cash",
	paytaca: "https://paytaca.com",
	optn: "https://optn.cash",
};

/** Sampled pairing links; WizardConnect's is fabricated in the same shape. */
export const PROTOCOL_LINKS: Readonly<Record<ProtocolId, string>> = {
	wizardconnect:
		"WIZ://%3FP%3DLDT6EGH3WX8C47LZ4XFZ0EUFHUWVPMZPVHJEX4PP3ZMHD63SQFNQ%26S%3DQK7G6VT7GMDTV",
	walletconnect:
		"wc:f351dbe7d12d683faad485fd648e4c1e8db60bf14258129bbe5aab111c2ba4a0@2?expiryTimestamp=1790141761&relay-protocol=irn&symKey=b20098400b519b8bcf583df011d74fad8b0020817d518a2e035b406acc00bc96",
	cashconnect:
		"bch-cc-v1:f40b68af88ef5de4f1a0a52a405d50e079bd7a6a36db7723b879650e5fc01c7d?relay=wss%3A%2F%2Fnostr.infra.cash",
};

function wallet(id: string): WalletSupport {
	const found = BCHC_WALLETS.find((entry) => entry.id === id);
	if (found === undefined) throw new Error(`fixture wallet not found: ${id}`);
	return found;
}

/** The wallet the toast stories show as connected. */
export const CONNECTED_WALLET: WalletSupport = wallet("cashonize");

/** `BCHC_WALLETS`, filtered to `protocol` and shaped as the modal's `wallets` view field. */
function walletsFor(protocol: ProtocolId): WalletOption[] {
	return BCHC_WALLETS.filter((entry) => entry.protocols.includes(protocol)).map(
		(entry) => ({
			id: entry.id,
			name: entry.name,
			logo: entry.logo,
			href: WALLET_HREF[entry.id] ?? null,
		}),
	);
}

export interface ViewOverrides {
	readonly screen?: ModalScreen;
	readonly protocol?: ProtocolId;
	readonly network?: Network;
	readonly phase?: ConnectPhase;
	/** Overrides the session types offered; defaults to every shipped protocol. */
	readonly protocols?: readonly ProtocolOption[];
	/** Overrides the connect screen's wallet list; defaults to `BCHC_WALLETS` filtered to `protocol`. */
	readonly wallets?: readonly WalletOption[];
	/** Overrides the "Get a wallet" directory; defaults to `BCHC_DIRECTORY`. */
	readonly directory?: readonly WalletDirectoryEntry[];
}

/** Builds a full `ModalView` for a story, defaulting to the scan state on mainnet. */
export function viewFor(overrides: ViewOverrides = {}): ModalView {
	const protocol = overrides.protocol ?? "wizardconnect";
	return {
		screen: overrides.screen ?? "connect",
		protocol,
		protocols: overrides.protocols ?? BCHC_PROTOCOLS,
		wallets: overrides.wallets ?? walletsFor(protocol),
		directory: overrides.directory ?? BCHC_DIRECTORY,
		network: overrides.network ?? "mainnet",
		phase: overrides.phase ?? {
			kind: "awaiting-approval",
			link: PROTOCOL_LINKS[protocol],
		},
	};
}
