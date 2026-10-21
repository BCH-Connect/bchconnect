import { describe, expect, it } from "vitest";
import { createLifetime } from "../../src/client/lifetime.js";

// Lets pending promise callbacks run.
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

describe("createLifetime", () => {
	it("should reject CONFIG while init() has not started", async () => {
		await expect(createLifetime().whenReady("connect")).rejects.toThrow(
			expect.objectContaining({
				code: "CONFIG",
				message: "connect() was called before init()",
			}),
		);
	});

	it("should wait for an init() that has started", async () => {
		const lifetime = createLifetime();
		let finish = () => {};
		const initialized = new Promise<void>((resolve) => {
			finish = resolve;
		});
		lifetime.start(() => initialized);
		let ready = false;

		const waiting = lifetime.whenReady("connect").then(() => {
			ready = true;
		});
		await settle();
		expect(ready).toBe(false);

		finish();
		await waiting;
		expect(ready).toBe(true);
	});

	it("should resolve once init() has finished", async () => {
		const lifetime = createLifetime();
		lifetime.start(() => Promise.resolve());

		await expect(lifetime.whenReady("connect")).resolves.toBeUndefined();
	});

	it("should reject ABORTED when the lifetime ends while waiting", async () => {
		const lifetime = createLifetime();
		lifetime.start(() => new Promise<void>(() => {}));
		const waiting = lifetime.whenReady("connect");

		lifetime.end();

		await expect(waiting).rejects.toThrow(
			expect.objectContaining({
				code: "ABORTED",
				message: "The client was disposed",
			}),
		);
	});

	it("should reject ABORTED once the lifetime has ended", async () => {
		const lifetime = createLifetime();
		lifetime.start(() => Promise.resolve());
		lifetime.end();

		await expect(lifetime.whenReady("connect")).rejects.toThrow(
			expect.objectContaining({ code: "ABORTED" }),
		);
	});

	it("should abort its signal when it ends", () => {
		const lifetime = createLifetime();

		lifetime.end();

		expect(lifetime.signal.aborted).toBe(true);
	});
});
