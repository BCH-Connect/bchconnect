/** WizardConnect protocol definition, typed by its extensions `E`. */
import type {
	Hdwalletv1Session,
	PathName,
	PathXpub,
} from "@wizardconnect/core";
import type {
	Connector,
	MethodDefinition,
	ProtocolDefinition,
	SignTransactionRequest,
} from "../../../src/index.js";
import type { MergeAll, Prettify } from "./type-utils.js";

/** One extension: session data, methods, events and a capability name. */
interface WizardExtension<
	N extends string = string,
	S = unknown,
	M extends Record<string, MethodDefinition> = Record<never, never>,
	E extends Record<string, unknown> = Record<never, never>,
	C extends string = never,
> {
	readonly name: N;
	readonly session: S;
	readonly methods: M;
	readonly events: E;
	readonly capability: C;
}

/**
 * The widest extension, for use as a constraint. `WizardExtension`'s defaults
 * describe an empty extension and would reject any real one.
 */
type AnyWizardExtension = WizardExtension<
	string,
	unknown,
	Record<string, MethodDefinition>,
	Record<string, unknown>,
	string
>;

type ExtensionSessionMap<E extends readonly AnyWizardExtension[]> = Prettify<{
	readonly [X in E[number] as X["name"]]: X["session"];
}>;

/**
 * Maps each value through `Extract` so the result satisfies
 * `Record<string, MethodDefinition>` while `E` is still generic.
 */
type MethodMapOf<T> = {
	[K in keyof T]: Extract<T[K], MethodDefinition>;
};

export interface WizardSessionData<E extends readonly AnyWizardExtension[]>
	extends Omit<Hdwalletv1Session, "extensions"> {
	readonly paths: PathXpub[];
	readonly extensions: ExtensionSessionMap<E>;
	readonly walletName?: string;
	readonly walletIcon?: string;
}

interface WizardBaseMethods {
	sign_transaction: {
		params: {
			readonly transaction: SignTransactionRequest;
			readonly inputPaths: readonly (readonly [number, PathName, number])[];
		};
		result: { signedTransaction: string };
		userInteraction: true;
	};
}

interface WizardBaseEvents {
	wallet_ready: { walletName?: string; walletIcon?: string };
	disconnect: { reason: string };
}

export interface Wizard<E extends readonly AnyWizardExtension[] = []>
	extends ProtocolDefinition {
	id: "wizardconnect";
	session: WizardSessionData<E>;
	methods: MethodMapOf<WizardBaseMethods & MergeAll<E[number]["methods"]>>;
	events: Prettify<WizardBaseEvents & MergeAll<E[number]["events"]>>;
	capability: "libauth-signing" | "xpub-derivation" | E[number]["capability"];
}

export type StealthExtension = WizardExtension<
	"bch_stealth_bip352",
	{ spend_path: string; scan_path: string },
	Record<never, never>,
	Record<never, never>,
	"stealth-addresses"
>;

export type DecryptExtension = WizardExtension<
	"decrypt",
	{ public_key: string; scheme: "ecies" },
	{
		decrypt: {
			params: { ciphertext: string };
			result: { plaintext: string };
			userInteraction: true;
		};
	},
	Record<never, never>,
	"decryption"
>;

export type RpaExtension = WizardExtension<
	"rpa_bip47",
	{ spend_path: string; scan_path: string },
	{ rpa_scan: { params: { fromHeight: number }; result: { found: string[] } } },
	{ rpa_payment_detected: { txid: string } },
	"reusable-payment-addresses"
>;

export declare function stealth(): StealthExtension;
export declare function decrypt(): DecryptExtension;
export declare function rpa(): RpaExtension;

/** `const E` keeps the extensions as a tuple so each one's types survive. */
export declare function wizard<
	const E extends readonly AnyWizardExtension[] = [],
>(config?: { readonly extensions?: E }): Connector<Wizard<E>>;
