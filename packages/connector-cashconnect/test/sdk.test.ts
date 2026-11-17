import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared with the mocked modules, which outlive `vi.resetModules()`.
const sdk = vi.hoisted(() => ({
	imports: { dapp: 0, nostr: 0, primitives: 0, templates: 0 },
	failure: undefined as unknown,
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	Dapp: class {},
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	NostrClient: class {},
}));

vi.mock("@cashconnect-js/nostr/dapp", () => ({
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	get Dapp() {
		sdk.imports.dapp += 1;
		if (sdk.failure !== undefined) throw sdk.failure;
		return sdk.Dapp;
	},
}));
vi.mock("@cashconnect-js/nostr", () => ({
	// biome-ignore lint/style/useNamingConvention: the SDK's export name.
	get NostrClient() {
		sdk.imports.nostr += 1;
		return sdk.NostrClient;
	},
}));
vi.mock("@cashconnect-js/core/primitives", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@cashconnect-js/core/primitives")>();
	return {
		...actual,
		// biome-ignore lint/style/useNamingConvention: the SDK's export name.
		get Bytes() {
			sdk.imports.primitives += 1;
			return actual.Bytes;
		},
	};
});
vi.mock("@cashconnect-js/core/templates", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@cashconnect-js/core/templates")>();
	return {
		...actual,
		// biome-ignore lint/style/useNamingConvention: the SDK's export name.
		get TemplateSchema() {
			sdk.imports.templates += 1;
			return actual.TemplateSchema;
		},
	};
});

// The memo lives in the module, so every test loads a copy of its own.
async function freshLoadSdk() {
	vi.resetModules();
	const { loadSdk } = await import("../src/sdk.js");
	return loadSdk;
}

beforeEach(() => {
	sdk.imports = { dapp: 0, nostr: 0, primitives: 0, templates: 0 };
	sdk.failure = undefined;
});

describe("loadSdk", () => {
	it("should resolve with the SDK's classes, primitives and template schema", async () => {
		const loadSdk = await freshLoadSdk();

		const loaded = await loadSdk();

		expect(loaded.Dapp).toBe(sdk.Dapp);
		expect(loaded.NostrClient).toBe(sdk.NostrClient);
		expect(loaded.Bytes.fromBigInt(1n).toHex()).toBe("01");
		expect(loaded.Address.fromCashAddr).toBeTypeOf("function");
		expect(loaded.Hasher.fromUTF8("").sha256().toHex()).toHaveLength(64);
		expect(loaded.TemplateSchema.safeParse({}).success).toBe(false);
	});

	it("should import each module once, whatever the number of calls", async () => {
		const loadSdk = await freshLoadSdk();

		const first = loadSdk();
		const second = loadSdk();
		const third = await loadSdk();

		expect(second).toBe(first);
		expect(await first).toBe(third);
		expect(sdk.imports).toEqual({
			dapp: 1,
			nostr: 1,
			primitives: 1,
			templates: 1,
		});
	});

	it("should import again after a load that failed", async () => {
		const loadSdk = await freshLoadSdk();
		sdk.failure = new Error("Cannot find module");

		await expect(loadSdk()).rejects.toBe(sdk.failure);
		await expect(loadSdk()).rejects.toBe(sdk.failure);
		expect(sdk.imports.dapp).toBe(2);
		sdk.failure = undefined;
		const loaded = await loadSdk();

		expect(loaded.Dapp).toBe(sdk.Dapp);
		expect(sdk.imports.dapp).toBe(3);
		expect(await loadSdk()).toBe(loaded);
		expect(sdk.imports.dapp).toBe(3);
	});
});
