import {
	type KeyValueStore,
	memory,
	stringifyExtendedJson,
} from "@bchconnect/core";
import { Hasher } from "@cashconnect-js/core/primitives";
import { describe, expect, it, vi } from "vitest";
import type { SdkSessionState } from "../src/sdk.js";
import { createSessionRecords, toTemplateHash } from "../src/store.js";
import { sendTemplate } from "../src/templates.js";
import { spyLogger } from "./fixtures/logger.js";

const HASH = "cd".repeat(32);
const BINDING = { chain: "bchtest", template: HASH } as const;
const PRIVATE_KEY = "11".repeat(32);
const WALLET = "22".repeat(32);
const TOKEN = "33".repeat(32);

// The four shapes the SDK writes, in the order it writes them.
const unpaired: SdkSessionState = {
	privateKeyHex: PRIVATE_KEY,
	walletPubkey: undefined,
	allowedTokens: undefined,
	lastEventTimestamp: undefined,
};
const unpairedLater: SdkSessionState = {
	...unpaired,
	lastEventTimestamp: 1731800000,
};
const paired: SdkSessionState = {
	privateKeyHex: PRIVATE_KEY,
	walletPubkey: WALLET,
	allowedTokens: [TOKEN],
	lastEventTimestamp: 1731800001,
};
const pairedLater: SdkSessionState = {
	...paired,
	lastEventTimestamp: 1731800011,
};

function setup(storage: KeyValueStore = memory()) {
	const logger = spyLogger();
	return { storage, logger, records: createSessionRecords(storage, logger) };
}

async function stored(storage: KeyValueStore, key: string): Promise<unknown> {
	const raw = await storage.get(key);
	return raw === undefined ? undefined : JSON.parse(raw);
}

function recordOf(state: SdkSessionState) {
	return { v: 1, chain: "bchtest", template: HASH, state };
}

describe("createSessionRecords", () => {
	it("should read no slots when nothing is stored", async () => {
		const { records } = setup();

		await expect(records.slots()).resolves.toEqual([]);
	});

	it("should never store the identity of an unpaired instance", async () => {
		const { storage, records, logger } = setup();
		const store = records.open("a", BINDING);

		await expect(store.get("a")).resolves.toBeUndefined();
		await store.set("a", unpaired);
		await store.set("a", unpairedLater);

		expect(await storage.get("slot:a")).toBeUndefined();
		expect(await storage.get("sessions")).toBeUndefined();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("should store a paired instance's record and index its slot", async () => {
		const { storage, records } = setup();
		const store = records.open("a", BINDING);

		await store.set("a", unpaired);
		await store.set("a", paired);

		expect(await stored(storage, "slot:a")).toEqual(recordOf(paired));
		expect(await stored(storage, "sessions")).toEqual({ v: 1, slots: ["a"] });
		await expect(store.get("a")).resolves.toEqual(paired);
	});

	it("should rewrite the record on later writes and index the slot once", async () => {
		const { storage, records } = setup();
		const store = records.open("a", BINDING);

		await store.set("a", paired);
		await store.set("a", pairedLater);

		expect(await stored(storage, "slot:a")).toEqual(recordOf(pairedLater));
		expect(await stored(storage, "sessions")).toEqual({ v: 1, slots: ["a"] });
	});

	it("should keep the slots of every paired instance, in the order they paired", async () => {
		const { records } = setup();

		await records.open("b", BINDING).set("b", paired);
		await records.open("a", BINDING).set("a", paired);

		await expect(records.slots()).resolves.toEqual(["b", "a"]);
	});

	it("should erase the record and its slot when the session ends", async () => {
		const { storage, records } = setup();
		const store = records.open("a", BINDING);
		await records.open("b", BINDING).set("b", paired);
		await store.set("a", paired);

		await store.set("a", {
			...pairedLater,
			walletPubkey: undefined,
			allowedTokens: undefined,
		});

		expect(await storage.get("slot:a")).toBeUndefined();
		expect(await stored(storage, "sessions")).toEqual({ v: 1, slots: ["b"] });
	});

	it("should delete the index with its last slot", async () => {
		const { storage, records } = setup();
		const store = records.open("a", BINDING);
		await store.set("a", paired);

		await store.set("a", unpairedLater);

		expect(await storage.get("slot:a")).toBeUndefined();
		expect(await storage.get("sessions")).toBeUndefined();
	});

	it("should read a stored record", async () => {
		const { records } = setup();
		await records.open("a", BINDING).set("a", paired);

		await expect(records.read("a")).resolves.toEqual({
			chain: "bchtest",
			template: HASH,
			state: paired,
		});
	});

	it("should read a record written without a timestamp", async () => {
		const { records } = setup();
		const state = { ...paired, lastEventTimestamp: undefined };
		await records.open("a", BINDING).set("a", state);

		await expect(records.read("a")).resolves.toEqual({
			chain: "bchtest",
			template: HASH,
			state: {
				privateKeyHex: PRIVATE_KEY,
				walletPubkey: WALLET,
				allowedTokens: [TOKEN],
			},
		});
	});

	it("should erase a slot", async () => {
		const { storage, records } = setup();
		await records.open("a", BINDING).set("a", paired);

		await records.erase("a");

		expect(await storage.get("slot:a")).toBeUndefined();
		expect(await storage.get("sessions")).toBeUndefined();
	});

	it("should erase the slot when closed, and ignore every later write", async () => {
		const { storage, records } = setup();
		const store = records.open("a", BINDING);
		await store.set("a", paired);

		await store.close();
		await store.set("a", pairedLater);

		expect(await storage.get("slot:a")).toBeUndefined();
		expect(await storage.get("sessions")).toBeUndefined();
	});

	it("should land writes in call order when the backend is slow", async () => {
		const backend = memory();
		const delays = [30, 0, 10];
		const slow: KeyValueStore = {
			get: (key) => backend.get(key),
			delete: (key) => backend.delete(key),
			async set(key, value) {
				await new Promise((resolve) =>
					setTimeout(resolve, delays.shift() ?? 0),
				);
				await backend.set(key, value);
			},
		};
		const { records } = setup(slow);
		const store = records.open("a", BINDING);

		void store.set("a", paired);
		void store.set("a", pairedLater);
		await store.set("a", { ...pairedLater, lastEventTimestamp: 1731800021 });

		expect(await stored(backend, "slot:a")).toEqual(
			recordOf({ ...pairedLater, lastEventTimestamp: 1731800021 }),
		);
	});

	it("should apply concurrent index changes one after another", async () => {
		const { records } = setup();

		await Promise.all([
			records.open("a", BINDING).set("a", paired),
			records.open("b", BINDING).set("b", paired),
			records.open("c", BINDING).set("c", paired),
			records.erase("b"),
		]);

		await expect(records.slots()).resolves.toEqual(["a", "c"]);
	});

	it("should never reject a write, and warn when the backend fails", async () => {
		const failure = new Error("QuotaExceededError");
		const backend: KeyValueStore = {
			get: vi.fn(async () => undefined),
			set: vi.fn(async () => {
				throw failure;
			}),
			delete: vi.fn(async () => {
				throw failure;
			}),
		};
		const { records, logger } = setup(backend);
		const store = records.open("a", BINDING);

		await expect(store.set("a", paired)).resolves.toBeUndefined();
		await expect(store.set("a", unpaired)).resolves.toBeUndefined();
		await expect(store.close()).resolves.toBeUndefined();

		expect(logger.warn).toHaveBeenCalledTimes(3);
		expect(logger.warn).toHaveBeenCalledWith(
			"A CashConnect session record could not be written",
		);
	});

	it("should keep writing after a write failed", async () => {
		const backend = memory();
		let fail = true;
		const flaky: KeyValueStore = {
			...backend,
			async set(key, value) {
				if (fail) {
					fail = false;
					throw new Error("Busy");
				}
				await backend.set(key, value);
			},
		};
		const { records } = setup(flaky);
		const store = records.open("a", BINDING);

		await store.set("a", paired);
		await store.set("a", pairedLater);

		expect(await stored(backend, "slot:a")).toEqual(recordOf(pairedLater));
	});

	it.each([
		["malformed JSON", "{"],
		["an unknown version", JSON.stringify({ ...recordOf(paired), v: 2 })],
		[
			"an unknown chain",
			JSON.stringify({ ...recordOf(paired), chain: "chipnet" }),
		],
		[
			"a short template hash",
			JSON.stringify({ ...recordOf(paired), template: "cd" }),
		],
		["no state", JSON.stringify({ v: 1, chain: "bchtest", template: HASH })],
		[
			"a short private key",
			JSON.stringify(recordOf({ ...paired, privateKeyHex: "11" })),
		],
		[
			"no wallet key",
			JSON.stringify(recordOf({ ...paired, walletPubkey: undefined })),
		],
		[
			"a non-hex wallet key",
			JSON.stringify(recordOf({ ...paired, walletPubkey: "zz".repeat(32) })),
		],
		[
			"token categories that are not strings",
			JSON.stringify({
				...recordOf(paired),
				state: { ...paired, allowedTokens: [1] },
			}),
		],
		[
			"no token categories",
			JSON.stringify(recordOf({ ...paired, allowedTokens: undefined })),
		],
		[
			"a negative timestamp",
			JSON.stringify(recordOf({ ...paired, lastEventTimestamp: -1 })),
		],
		[
			"a fractional timestamp",
			JSON.stringify(recordOf({ ...paired, lastEventTimestamp: 1.5 })),
		],
	])("should read %s as no record, erase it, and warn", async (_, raw) => {
		const { storage, records, logger } = setup();
		await records.open("a", BINDING).set("a", paired);
		await storage.set("slot:a", raw);

		await expect(records.read("a")).resolves.toBeUndefined();

		expect(await storage.get("slot:a")).toBeUndefined();
		expect(await storage.get("sessions")).toBeUndefined();
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn).toHaveBeenCalledWith(
			"Erasing an unreadable CashConnect session record",
		);
	});

	it("should hand the SDK no state for an unreadable record", async () => {
		const { storage, records } = setup();
		await storage.set("slot:a", "{");

		await expect(records.open("a", BINDING).get("a")).resolves.toBeUndefined();
		expect(await storage.get("slot:a")).toBeUndefined();
	});

	it("should drop an indexed slot whose record is missing, without a warning", async () => {
		const { storage, records, logger } = setup();
		await records.open("a", BINDING).set("a", paired);
		await records.open("b", BINDING).set("b", paired);
		await storage.delete("slot:a");

		await expect(records.read("a")).resolves.toBeUndefined();

		await expect(records.slots()).resolves.toEqual(["b"]);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it.each([
		["malformed JSON", "{"],
		["an unknown version", JSON.stringify({ v: 2, slots: ["a"] })],
		["a wrong shape", JSON.stringify({ v: 1, slots: [1] })],
	])(
		"should read an index with %s as no slots, erase it, and warn",
		async (_, raw) => {
			const { storage, records, logger } = setup();
			await storage.set("sessions", raw);

			await expect(records.slots()).resolves.toEqual([]);

			expect(await storage.get("sessions")).toBeUndefined();
			expect(logger.warn).toHaveBeenCalledOnce();
			expect(logger.warn).toHaveBeenCalledWith(
				"Erasing an unreadable CashConnect session index",
			);
		},
	);

	it("should list the indexed slots and delete a slot through the SDK store", async () => {
		const { storage, records } = setup();
		const store = records.open("a", BINDING);
		await store.set("a", paired);
		await records.open("b", BINDING).set("b", paired);

		await expect(store.list()).resolves.toEqual(["a", "b"]);
		await store.delete("a");

		expect(await storage.get("slot:a")).toBeUndefined();
		await expect(records.slots()).resolves.toEqual(["b"]);
	});

	it("should pass a failing read on to the caller", async () => {
		const failure = new Error("SecurityError");
		const backend: KeyValueStore = {
			...memory(),
			get: async () => {
				throw failure;
			},
		};
		const { records } = setup(backend);

		await expect(records.open("a", BINDING).get("a")).rejects.toBe(failure);
		await expect(records.slots()).rejects.toBe(failure);
	});
});

describe("toTemplateHash", () => {
	it("should be the SHA-256 of the template's extended JSON, in hex", async () => {
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(stringifyExtendedJson(sendTemplate)),
		);
		const expected = Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");

		expect(toTemplateHash(Hasher, sendTemplate)).toBe(expected);
	});

	it("should change when the template changes", () => {
		expect(toTemplateHash(Hasher, { ...sendTemplate, name: "Other" })).not.toBe(
			toTemplateHash(Hasher, sendTemplate),
		);
	});
});
