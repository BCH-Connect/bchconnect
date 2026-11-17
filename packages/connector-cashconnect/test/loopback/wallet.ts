import {
	encodeCashAddress,
	encodeLockingBytecodeP2pkh,
	hash160,
	hexToBin,
	type Output,
	secp256k1,
	sha256,
	walletTemplateP2pkhNonHd,
	walletTemplateToCompilerBch,
} from "@bitauth/libauth";
import { PrivateKey } from "@cashconnect-js/core/primitives";
import type { SpendableUTXO } from "@cashconnect-js/core/templates";
import {
	type ExecuteActionRequest,
	type ExecuteActionResponse,
	MemoryStore,
	type SessionCreateRequest,
	type SessionProposalResponse,
} from "@cashconnect-js/nostr";
import {
	Wallet as SdkWallet,
	type WalletSession,
} from "@cashconnect-js/nostr/wallet";

/** The P2PKH locking bytecode of the key `privateKeyHex`. */
function toLockingBytecode(privateKeyHex: string): Uint8Array {
	const publicKey = secp256k1.derivePublicKeyCompressed(
		hexToBin(privateKeyHex),
	);
	if (typeof publicKey === "string") throw new Error(publicKey);
	return encodeLockingBytecodeP2pkh(hash160(publicKey));
}

/** The address of `lockingBytecode`, a P2PKH script, on the network of `prefix`. */
function toAddress(
	prefix: "bchtest" | "bitcoincash",
	lockingBytecode: Uint8Array,
): string {
	return encodeCashAddress({
		prefix,
		type: "p2pkh",
		// The 20-byte hash sits between the script's three leading and two trailing opcodes.
		payload: lockingBytecode.slice(3, 23),
	}).address;
}

const walletKey = "11".repeat(32);
const compiler = walletTemplateToCompilerBch(walletTemplateP2pkhNonHd);
const data = { keys: { privateKeys: { key: hexToBin(walletKey) } } };

/** The script every coin of the wallet is locked to, and its change goes to. */
export const walletLockingBytecode: Uint8Array = toLockingBytecode(walletKey);

/** The script of an address the wallet does not own. */
export const recipientLockingBytecode: Uint8Array = toLockingBytecode(
	"22".repeat(32),
);

/** {@link recipientLockingBytecode} as a chipnet address. */
export const recipientAddress: string = toAddress(
	"bchtest",
	recipientLockingBytecode,
);

/** {@link recipientLockingBytecode} as a mainnet address. */
export const recipientMainnetAddress: string = toAddress(
	"bitcoincash",
	recipientLockingBytecode,
);

let nextOutpoint = 0;

/** Builds a coin the wallet can spend, optionally holding a token. */
export function createUtxo(
	valueSatoshis: bigint,
	token?: NonNullable<Output["token"]>,
): SpendableUTXO {
	return {
		outpointTransactionHash: sha256.hash(Uint8Array.of(nextOutpoint++)),
		outpointIndex: 0,
		sequenceNumber: 0,
		unlockingBytecode: { compiler, data, script: "unlock" },
		sourceOutput: {
			lockingBytecode: walletLockingBytecode,
			valueSatoshis,
			...(token === undefined ? {} : { token }),
		},
	};
}

/** An action as the wallet built it, waiting for the wallet's answer. */
export interface ReceivedAction {
	readonly request: ExecuteActionRequest;
	readonly response: ExecuteActionResponse;
	/** Aborts when the dapp gives the request up. */
	readonly signal: AbortSignal;
}

/** A wallet on the real SDK that records what reaches it. */
export interface Wallet {
	readonly sdk: SdkWallet;
	/** The coins the wallet holds; tests replace or extend them. */
	utxos: SpendableUTXO[];
	/** Answers a pairing proposal; by default approves with the tokens asked for. A rejection declines. */
	answerProposal(
		proposal: SessionProposalResponse,
	): Promise<SessionCreateRequest>;
	/** Answers a built action; by default approves it. A rejection declines. */
	answerAction(action: ReceivedAction): Promise<void>;
	readonly proposals: readonly SessionProposalResponse[];
	readonly actions: readonly ReceivedAction[];
	/** Public keys of the dapps whose sessions ended. */
	readonly deleted: readonly string[];
	/** The wallet's one session, as the wallet holds it. */
	session(): WalletSession;
	close(): Promise<void>;
}

/** Starts a wallet connected to the SDK's default relay, which never reconnects on its own. */
export async function startWallet(): Promise<Wallet> {
	const proposals: SessionProposalResponse[] = [];
	const actions: ReceivedAction[] = [];
	const deleted: string[] = [];
	const wallet: Wallet = {
		sdk: new SdkWallet({
			cashConnectPrivateKey: PrivateKey.from("33".repeat(32)),
			store: new MemoryStore<WalletSession>(),
			connectionPolicy: null,
			eventCallbacks: {
				onSessionProposal(proposal) {
					proposals.push(proposal);
					return wallet.answerProposal(proposal);
				},
				onExecuteAction(_session, request, response, signal) {
					const action = { request, response, signal };
					actions.push(action);
					return wallet.answerAction(action);
				},
				onSessionDelete(dappPubkey) {
					deleted.push(dappPubkey);
				},
			},
			contextCallbacks: {
				// biome-ignore lint/style/useNamingConvention: the SDK's callback name.
				getSpendableUTXOs: () => wallet.utxos,
				// The SDK compiles the change script for every action, even one that spends nothing.
				getChangeTemplateDirective: () => ({
					lock: { compiler, data, script: "lock" },
					unlock: { compiler, data, script: "unlock" },
					fee: 1000n,
				}),
				getSourceOutput() {
					throw new Error("No action of the suite names its own inputs");
				},
			},
		}),
		utxos: [],
		answerProposal: async ({ allowedTokens }) => ({ allowedTokens }),
		answerAction: async () => {},
		proposals,
		actions,
		deleted,
		session() {
			const [session, ...others] = Object.values(
				wallet.sdk.getActiveSessions(),
			);
			if (session === undefined || others.length > 0) {
				throw new Error("The wallet does not hold exactly one session");
			}
			return session;
		},
		close: () => wallet.sdk.stop(),
	};
	await wallet.sdk.start();
	return wallet;
}
