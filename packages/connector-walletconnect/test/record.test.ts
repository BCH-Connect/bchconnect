import { memory } from "@bchconnect/core";
import { describe, expect, it } from "vitest";
import { createRecord } from "../src/record.js";
import { spyLogger } from "./fixtures/logger.js";

describe("createRecord", () => {
	it("should read no topics when nothing is stored", async () => {
		const storage = memory();
		const record = createRecord(storage, spyLogger());

		await expect(record.topics()).resolves.toEqual([]);
	});

	it("should store added topics under the sessions key, in order", async () => {
		const storage = memory();
		const record = createRecord(storage, spyLogger());

		await record.add("a");
		await record.add("b");
		await record.add("a");

		await expect(record.topics()).resolves.toEqual(["a", "b"]);
		expect(JSON.parse((await storage.get("sessions")) ?? "")).toEqual({
			v: 1,
			topics: ["a", "b"],
		});
	});

	it("should remove topics, and the key with the last one", async () => {
		const storage = memory();
		const record = createRecord(storage, spyLogger());
		await record.add("a");
		await record.add("b");

		await record.remove(["a", "missing"]);
		expect(await record.topics()).toEqual(["b"]);

		await record.remove(["b"]);
		expect(await storage.get("sessions")).toBeUndefined();
	});

	it("should apply concurrent changes one after another", async () => {
		const storage = memory();
		const record = createRecord(storage, spyLogger());

		await Promise.all([record.add("a"), record.add("b"), record.remove(["a"])]);

		await expect(record.topics()).resolves.toEqual(["b"]);
	});

	it.each([
		["an unknown version", JSON.stringify({ v: 2, topics: ["a"] })],
		["malformed JSON", "{"],
		["a wrong shape", JSON.stringify({ v: 1, topics: [1] })],
	])("should read %s as no topics, with a warning", async (_, stored) => {
		const storage = memory();
		await storage.set("sessions", stored);
		const logger = spyLogger();
		const record = createRecord(storage, logger);

		await expect(record.topics()).resolves.toEqual([]);
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(await storage.get("sessions")).toBe(stored);
	});
});
