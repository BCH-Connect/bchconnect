import {
	type Connector,
	createClient,
	type ProtocolDefinition,
} from "@bchconnect/core";
import type { CashConnect } from "../../../src/index.js";
import type { FixtureTemplate } from "./template.js";

/** A protocol other than CashConnect, for clients that do not register it. */
export interface Other extends ProtocolDefinition {
	id: "other";
	session: null;
	methods: { ping: { params: undefined; result: null } };
	events: Record<never, never>;
	capability: "other-capability";
}

/** CashConnect as registered on {@link client}. */
export type TestCashConnect = CashConnect<FixtureTemplate>;

declare const cashConnectConnector: Connector<TestCashConnect>;
declare const otherConnector: Connector<Other>;

const appMetadata = { name: "Type test", url: "https://dapp.example" };

/** A client with CashConnect and one other protocol. */
export const client = createClient({
	connectors: [cashConnectConnector, otherConnector],
	network: "chipnet",
	appMetadata,
});

/** A client without CashConnect. */
export const otherClient = createClient({
	connectors: [otherConnector],
	network: "chipnet",
	appMetadata,
});
