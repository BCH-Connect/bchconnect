import { afterEach, describe, expect, it, vi } from "vitest";
import { localStorage } from "../../src/storage/local-storage.js";

function createWebStorage() {
	const entries = new Map<string, string>();

	return {
		entries,
		getItem: vi.fn((key: string) => entries.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			entries.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			entries.delete(key);
		}),
	};
}

// Counts reads of `window.localStorage`, the access that throws where storage is blocked.
function stubWindow(storage: () => unknown) {
	const read = vi.fn(storage);
	vi.stubGlobal("window", {
		get localStorage() {
			return read();
		},
	});

	return read;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("localStorage", () => {
	describe("with Web Storage", () => {
		it("should write through to window.localStorage", async () => {
			const web = createWebStorage();
			stubWindow(() => web);

			await localStorage().set("key", "value");

			expect(web.entries.get("key")).toBe("value");
		});

		it("should read what window.localStorage holds", async () => {
			const web = createWebStorage();
			web.entries.set("key", "value");
			stubWindow(() => web);

			await expect(localStorage().get("key")).resolves.toBe("value");
		});

		it("should return undefined for an absent key", async () => {
			stubWindow(() => createWebStorage());

			await expect(localStorage().get("missing")).resolves.toBeUndefined();
		});

		it("should remove the entry on delete", async () => {
			const web = createWebStorage();
			web.entries.set("key", "value");
			stubWindow(() => web);

			await localStorage().delete("key");

			expect(web.entries.has("key")).toBe(false);
		});

		it("should not read window.localStorage until the first operation", async () => {
			const read = stubWindow(() => createWebStorage());

			const storage = localStorage();
			expect(read).not.toHaveBeenCalled();

			await storage.get("key");
			await storage.set("key", "value");
			expect(read).toHaveBeenCalledOnce();
		});

		it("should reject with the browser's error when a write fails", async () => {
			const web = createWebStorage();
			const quota = new Error("QuotaExceededError");
			web.setItem.mockImplementation(() => {
				throw quota;
			});
			stubWindow(() => web);

			await expect(localStorage().set("key", "value")).rejects.toBe(quota);
		});

		it("should reject with the browser's error when a read fails", async () => {
			const web = createWebStorage();
			const denied = new Error("SecurityError");
			web.getItem.mockImplementation(() => {
				throw denied;
			});
			stubWindow(() => web);

			await expect(localStorage().get("key")).rejects.toBe(denied);
		});
	});

	describe("without Web Storage", () => {
		it("should keep entries in memory when there is no window", async () => {
			const storage = localStorage();

			await storage.set("key", "value");

			await expect(storage.get("key")).resolves.toBe("value");
		});

		it("should keep entries in memory when reading window.localStorage throws", async () => {
			stubWindow(() => {
				throw new Error("SecurityError");
			});
			const storage = localStorage();

			await storage.set("key", "value");

			await expect(storage.get("key")).resolves.toBe("value");
		});

		it("should stay in memory once web storage was found unavailable", async () => {
			const web = createWebStorage();
			let blocked = true;
			stubWindow(() => {
				if (blocked) throw new Error("SecurityError");
				return web;
			});
			const storage = localStorage();
			await storage.set("key", "value");

			blocked = false;
			await storage.set("other", "value");

			await expect(storage.get("key")).resolves.toBe("value");
			expect(web.entries.size).toBe(0);
		});

		it("should keep entries in memory when window has no localStorage", async () => {
			stubWindow(() => undefined);
			const storage = localStorage();

			await storage.set("key", "value");
			await storage.delete("key");

			await expect(storage.get("key")).resolves.toBeUndefined();
		});

		it("should keep each store's entries separate", async () => {
			const first = localStorage();
			const second = localStorage();

			await first.set("key", "value");

			await expect(second.get("key")).resolves.toBeUndefined();
		});
	});
});
