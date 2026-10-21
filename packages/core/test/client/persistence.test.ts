import { demoSession } from "@bchconnect/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createPersistence } from "../../src/client/persistence.js";
import { createClientRuntime } from "../../src/client/runtime.js";
import {
	SNAPSHOT_KEY,
	serializeSnapshot,
	toSnapshot,
} from "../../src/snapshot.js";
import { memory } from "../../src/storage/memory.js";
import type { LifecycleEvents } from "../../src/types/client.js";
import type { KeyValueStore } from "../../src/types/protocol.js";

const appMetadata = { name: "Test", url: "https://example.com" };

// Lets queued storage writes run.
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

function setup(storage: KeyValueStore = memory()) {
	const runtime = createClientRuntime({
		connectors: [],
		network: "chipnet",
		appMetadata,
		storage,
	});
	const errors: LifecycleEvents["client:error"][] = [];
	runtime.events.on("client:error", (payload) => errors.push(payload));
	const { store } = runtime;

	function addSession(id: string) {
		store.setState((state) => ({
			...state,
			sessions: new Map(state.sessions).set(id, demoSession({ id })),
			currentSessionId: id,
		}));
	}

	function snapshot() {
		return serializeSnapshot(toSnapshot(store.getState(), "chipnet"));
	}

	return {
		store,
		storage,
		errors,
		persistence: createPersistence(runtime),
		addSession,
		snapshot,
	};
}

describe("createPersistence", () => {
	it("should write nothing before start()", async () => {
		const { storage, addSession } = setup();

		addSession("first");
		await settle();

		await expect(storage.get(SNAPSHOT_KEY)).resolves.toBeUndefined();
	});

	it("should write the snapshot when a session is added", async () => {
		const { storage, persistence, addSession, snapshot } = setup();
		persistence.start(undefined);

		addSession("first");
		await settle();

		await expect(storage.get(SNAPSHOT_KEY)).resolves.toBe(snapshot());
	});

	it("should not rewrite a snapshot that matches the reference", async () => {
		const { store, storage, persistence } = setup();
		const set = vi.spyOn(storage, "set");
		const first = demoSession({ id: "first" });
		const sessions = new Map([["first", first]]);
		persistence.start(
			toSnapshot({ sessions, currentSessionId: "first" }, "chipnet"),
		);

		store.setState((state) => ({
			...state,
			sessions,
			currentSessionId: "first",
		}));
		await settle();

		expect(set).not.toHaveBeenCalled();
	});

	it("should delete the snapshot once the last session is gone", async () => {
		const { store, storage, persistence, addSession } = setup();
		persistence.start(undefined);
		addSession("first");

		store.setState((state) => ({
			...state,
			sessions: new Map(),
			currentSessionId: null,
		}));
		await settle();

		await expect(storage.get(SNAPSHOT_KEY)).resolves.toBeUndefined();
	});

	it("should write consecutive changes in order", async () => {
		const { store, storage, persistence, addSession, snapshot } = setup();
		const set = vi.spyOn(storage, "set");
		persistence.start(undefined);
		const written: string[] = [];

		addSession("first");
		written.push(snapshot());
		addSession("second");
		written.push(snapshot());
		store.setState((state) => ({ ...state, currentSessionId: "first" }));
		written.push(snapshot());
		await settle();

		expect(set.mock.calls.map(([, value]) => value)).toEqual(written);
		await expect(storage.get(SNAPSHOT_KEY)).resolves.toBe(written[2]);
	});

	it("should not rewrite on a change that leaves the snapshot as it was", async () => {
		const { store, storage, persistence, addSession } = setup();
		persistence.start(undefined);
		addSession("first");
		await settle();
		const set = vi.spyOn(storage, "set");

		store.setState((state) => ({ ...state, pendingRequests: new Map() }));
		await settle();

		expect(set).not.toHaveBeenCalled();
	});

	it("should report a failed write and write again on the next notification", async () => {
		const failure = new Error("Quota exceeded");
		const { store, storage, errors, persistence, addSession, snapshot } =
			setup();
		const set = vi.spyOn(storage, "set").mockRejectedValueOnce(failure);
		persistence.start(undefined);

		addSession("first");
		await settle();
		store.setState((state) => ({ ...state, pendingRequests: new Map() }));
		await settle();

		expect(errors).toEqual([
			{
				error: expect.objectContaining({
					code: "TRANSPORT",
					message: "Writing the client snapshot failed",
					cause: failure,
				}),
			},
		]);
		expect(set).toHaveBeenCalledTimes(2);
		await expect(storage.get(SNAPSHOT_KEY)).resolves.toBe(snapshot());
	});

	describe("stop", () => {
		it("should write nothing after stop()", async () => {
			const { storage, persistence, addSession } = setup();
			persistence.start(undefined);

			await persistence.stop();
			addSession("first");
			await settle();

			await expect(storage.get(SNAPSHOT_KEY)).resolves.toBeUndefined();
		});

		it("should resolve once the queued writes have landed", async () => {
			let land = () => {};
			const base = memory();
			const storage: KeyValueStore = {
				...base,
				set: (key, value) =>
					new Promise<void>((resolve) => {
						land = () => resolve(base.set(key, value));
					}),
			};
			const { persistence, addSession, snapshot } = setup(storage);
			persistence.start(undefined);
			addSession("first");
			let stopped = false;

			const stopping = persistence.stop().then(() => {
				stopped = true;
			});
			await settle();
			expect(stopped).toBe(false);

			land();
			await stopping;
			await expect(base.get(SNAPSHOT_KEY)).resolves.toBe(snapshot());
		});
	});
});
