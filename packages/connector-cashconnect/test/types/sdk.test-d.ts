import type {
	Address,
	Bytes,
	Hasher,
	Logger,
} from "@cashconnect-js/core/primitives";
import type { Template, TemplateSchema } from "@cashconnect-js/core/templates";
import type {
	Chain,
	ConnectionPolicy,
	DappInfo,
	NostrClient,
} from "@cashconnect-js/nostr";
import type { Dapp, DappEvents, DappOptions } from "@cashconnect-js/nostr/dapp";
import { describe, expectTypeOf, it } from "vitest";
import type {
	SdkAddressClass,
	SdkBytesClass,
	SdkConnectionPolicy,
	SdkDapp,
	SdkDappClass,
	SdkDappEvents,
	SdkDappInfo,
	SdkDappOptions,
	SdkHasherClass,
	SdkLogger,
	SdkNostrClient,
	SdkNostrClientClass,
	SdkTemplateSchema,
} from "../../src/sdk.js";
import type { SlotStore } from "../../src/store.js";
import type { CashConnectChain } from "../../src/types.js";

declare const sdkOptions: Omit<SdkDappOptions, "template">;
declare const installedDapp: typeof Dapp;

describe("SdkDapp", () => {
	it("should be satisfied by the installed Dapp", () => {
		expectTypeOf<Dapp<Template>>().toExtend<SdkDapp>();
	});

	it("should type the events the installed Dapp emits", () => {
		expectTypeOf<keyof SdkDappEvents>().toEqualTypeOf<keyof DappEvents>();
		expectTypeOf<DappEvents>().toExtend<SdkDappEvents>();
	});
});

describe("SdkDappOptions", () => {
	it("should be accepted by the installed Dapp, except for the template", () => {
		const options: Omit<DappOptions<Template>, "template"> = sdkOptions;
		expectTypeOf(options).not.toBeAny();
	});

	it("should give the installed Dapp the slot store", () => {
		expectTypeOf<SlotStore>().toExtend<
			NonNullable<DappOptions<Template>["store"]>
		>();
	});

	it("should take the chains and dapp identity the installed SDK accepts", () => {
		expectTypeOf<CashConnectChain>().toEqualTypeOf<Chain>();
		expectTypeOf<SdkDappInfo>().toExtend<DappInfo>();
		expectTypeOf<SdkLogger>().toExtend<Logger>();
		expectTypeOf<SdkConnectionPolicy>().toExtend<ConnectionPolicy>();
	});
});

describe("SdkDappClass", () => {
	it("should need a cast only because the installed Dapp takes a mutable template", () => {
		// @ts-expect-error The installed Dapp takes a mutable template, which a readonly one cannot satisfy.
		const dapp: SdkDappClass = installedDapp;
		expectTypeOf(dapp).not.toBeAny();
		expectTypeOf<typeof Dapp>().toExtend<
			new (
				options: Omit<SdkDappOptions, "template"> & { template: Template },
			) => SdkDapp
		>();
	});
});

describe("SdkNostrClient", () => {
	it("should be satisfied by the installed client", () => {
		expectTypeOf<NostrClient>().toExtend<SdkNostrClient>();
	});

	it("should be created by the installed client class", () => {
		expectTypeOf<typeof NostrClient>().toExtend<SdkNostrClientClass>();
	});
});

describe("SdkPrimitives", () => {
	it("should be satisfied by the installed primitives", () => {
		expectTypeOf<typeof Bytes>().toExtend<SdkBytesClass>();
		expectTypeOf<typeof Address>().toExtend<SdkAddressClass>();
		expectTypeOf<typeof Hasher>().toExtend<SdkHasherClass>();
	});

	it("should be satisfied by the installed template schema", () => {
		expectTypeOf<typeof TemplateSchema>().toExtend<SdkTemplateSchema>();
	});
});
