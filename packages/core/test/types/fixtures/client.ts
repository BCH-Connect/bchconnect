// Type-level stand-ins for runtime that later phases add (createClient) or
// that lives in binding packages (useClient, useSession).
import type {
	Client,
	ClientConfig,
	Connector,
	ProtocolOf,
	RegisteredClient,
	RegisteredSession,
	Session,
} from "../../../src/index.js";
import { type CashConnect, cashConnect } from "./cashconnect.js";
import { alpha, bravo, charlie, delta, echo, foxtrot } from "./stress/index.js";
import { type LiteralTemplate, literalTemplate } from "./template-literal.js";
import { type Wc2, walletConnect } from "./wc2.js";
import {
	type DecryptExtension,
	decrypt,
	type RpaExtension,
	rpa,
	type StealthExtension,
	stealth,
	type Wizard,
	wizard,
} from "./wizard.js";

declare function createClient<const Connectors extends readonly Connector[]>(
	config: ClientConfig<Connectors>,
): Client<ProtocolOf<Connectors[number]>>;

export declare function useClient(): RegisteredClient;
export declare function useSession(): RegisteredSession | null;

/** Exhaustiveness witness. */
export declare function assertNever(value: never): never;

const appMetadata = { name: "Test", url: "https://example.com" };

/** WizardConnect as registered on {@link client}. */
export type TestWizard = Wizard<[StealthExtension, DecryptExtension]>;
/** CashConnect as registered on {@link client}. */
export type TestCashConnect = CashConnect<LiteralTemplate>;
/** Any session of {@link client}. */
export type TestSession =
	| Session<TestWizard>
	| Session<Wc2>
	| Session<TestCashConnect>;

/** The three-protocol client most tests share. */
export const client = createClient({
	connectors: [
		wizard({ extensions: [stealth(), decrypt()] }),
		walletConnect({ projectId: "test" }),
		cashConnect({ template: literalTemplate }),
	],
	network: "chipnet",
	appMetadata,
});

/** A WizardConnect-only client with no extensions. */
export const bareClient = createClient({
	connectors: [wizard()],
	network: "chipnet",
	appMetadata,
});

/** WizardConnect as registered on {@link nineClient}. */
export type NineWizard = Wizard<
	[StealthExtension, DecryptExtension, RpaExtension]
>;

/** The three real protocols plus six stress protocols. */
export const nineClient = createClient({
	connectors: [
		wizard({ extensions: [stealth(), decrypt(), rpa()] }),
		walletConnect({ projectId: "test" }),
		cashConnect({ template: literalTemplate }),
		alpha(),
		bravo(),
		charlie(),
		delta(),
		echo(),
		foxtrot(),
	],
	network: "chipnet",
	appMetadata,
});
