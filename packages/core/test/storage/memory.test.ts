import { describe, expect, it } from "vitest";
import { memory } from "../../src/storage/memory.js";

describe("memory", () => {
	it("should return undefined for an absent key", async () => {
		const storage = memory();

		await expect(storage.get("missing")).resolves.toBeUndefined();
	});

	it("should return the stored value", async () => {
		const storage = memory();

		await storage.set("key", "value");

		await expect(storage.get("key")).resolves.toBe("value");
	});

	it("should overwrite an existing value", async () => {
		const storage = memory();

		await storage.set("key", "first");
		await storage.set("key", "second");

		await expect(storage.get("key")).resolves.toBe("second");
	});

	it("should keep an empty string as a stored value", async () => {
		const storage = memory();

		await storage.set("key", "");

		await expect(storage.get("key")).resolves.toBe("");
	});

	it("should remove a value on delete", async () => {
		const storage = memory();
		await storage.set("key", "value");

		await storage.delete("key");

		await expect(storage.get("key")).resolves.toBeUndefined();
	});

	it("should resolve when deleting an absent key", async () => {
		const storage = memory();

		await expect(storage.delete("missing")).resolves.toBeUndefined();
	});

	it("should keep separate stores independent", async () => {
		const first = memory();
		const second = memory();

		await first.set("key", "value");

		await expect(second.get("key")).resolves.toBeUndefined();
	});
});
