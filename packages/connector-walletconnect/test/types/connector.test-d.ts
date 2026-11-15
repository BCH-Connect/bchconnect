import {
	type Connector,
	createClient,
	type LibauthSigning,
	type MessageSigning,
	type Session,
} from "@bchconnect/core";
import type { SignClient } from "@walletconnect/sign-client";
import { describe, expectTypeOf, it } from "vitest";
import {
	type WalletConnect,
	type WalletConnectSessionData,
	walletConnect,
} from "../../src/index.js";
import type { SdkSignClient, SdkSignClientFactory } from "../../src/sdk.js";

const connector = walletConnect({ projectId: "project-id" });
const client = createClient({
	connectors: [connector],
	network: "chipnet",
	appMetadata: { name: "Type test", url: "https://dapp.example" },
});
declare const session: Session<WalletConnect>;

describe("walletConnect", () => {
	it("should return a connector of the protocol", () => {
		expectTypeOf(connector).toEqualTypeOf<Connector<WalletConnect>>();
	});

	it("should be accepted wherever any connector is", () => {
		expectTypeOf(connector).toExtend<Connector>();
	});

	it("should type the client's session data", () => {
		expectTypeOf(
			client.session("bch-wc2"),
		).toEqualTypeOf<Session<WalletConnect> | null>();
		expectTypeOf(session.data).toEqualTypeOf<WalletConnectSessionData>();
	});

	it("should type the signing capabilities", () => {
		expectTypeOf(
			client.capability(session, "libauth-signing"),
		).toEqualTypeOf<LibauthSigning | null>();
		expectTypeOf(
			client.capability(session, "message-signing"),
		).toEqualTypeOf<MessageSigning | null>();
	});
});

describe("SdkSignClient", () => {
	it("should be satisfied by the installed sign client", () => {
		expectTypeOf<
			Awaited<ReturnType<typeof SignClient.init>>
		>().toExtend<SdkSignClient>();
	});

	it("should be created by the installed sign client class", () => {
		expectTypeOf<typeof SignClient>().toExtend<SdkSignClientFactory>();
	});
});
