import { describe, expect, it } from "vitest";
import { memory } from "../../src/storage/memory.js";
import { connectorPrefix, namespaced } from "../../src/storage/namespace.js";

describe("connectorPrefix", () => {
	it("should build the protocol's key prefix", () => {
		expect(connectorPrefix("wizard")).toBe("bchconnect:wizard:");
	});
});

describe("namespaced", () => {
	it("should read back a value under the caller's own key", async () => {
		const storage = namespaced(memory(), "ns:");

		await storage.set("key", "value");

		await expect(storage.get("key")).resolves.toBe("value");
	});

	it("should write the prefixed key to the underlying store", async () => {
		const base = memory();
		const storage = namespaced(base, "ns:");

		await storage.set("key", "value");

		await expect(base.get("ns:key")).resolves.toBe("value");
		await expect(base.get("key")).resolves.toBeUndefined();
	});

	it("should read only keys under its prefix", async () => {
		const base = memory();
		await base.set("key", "outside");
		const storage = namespaced(base, "ns:");

		await expect(storage.get("key")).resolves.toBeUndefined();
	});

	it("should delete only the prefixed key", async () => {
		const base = memory();
		await base.set("key", "outside");
		const storage = namespaced(base, "ns:");
		await storage.set("key", "inside");

		await storage.delete("key");

		await expect(storage.get("key")).resolves.toBeUndefined();
		await expect(base.get("key")).resolves.toBe("outside");
	});

	it("should isolate two namespaces over one store", async () => {
		const base = memory();
		const wizard = namespaced(base, connectorPrefix("wizard"));
		const wc2 = namespaced(base, connectorPrefix("bch-wc2"));

		await wizard.set("key", "wizard");
		await wc2.set("key", "wc2");

		await expect(wizard.get("key")).resolves.toBe("wizard");
		await expect(wc2.get("key")).resolves.toBe("wc2");
	});

	it("should propagate a rejection from the underlying store", async () => {
		const failure = new Error("quota exceeded");
		const storage = namespaced(
			{
				get: () => Promise.reject(failure),
				set: () => Promise.reject(failure),
				delete: () => Promise.reject(failure),
			},
			"ns:",
		);

		await expect(storage.get("key")).rejects.toBe(failure);
		await expect(storage.set("key", "value")).rejects.toBe(failure);
		await expect(storage.delete("key")).rejects.toBe(failure);
	});
});
