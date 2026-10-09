import { describe, expect, it, vi } from "vitest";
import { createStore } from "../src/store.js";
import type { Logger } from "../src/types/protocol.js";

function createLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

describe("createStore", () => {
	it("should hold the initial state", () => {
		const initial = { count: 0 };

		expect(createStore(initial, createLogger()).getState()).toBe(initial);
	});

	it("should replace the state with the updater's result", () => {
		const store = createStore({ count: 0 }, createLogger());
		const next = { count: 1 };

		store.setState(() => next);

		expect(store.getState()).toBe(next);
	});

	it("should pass the current state to the updater", () => {
		const store = createStore({ count: 1 }, createLogger());

		store.setState((previous) => ({ count: previous.count + 1 }));

		expect(store.getState()).toEqual({ count: 2 });
	});

	it("should notify a subscriber once per transition", () => {
		const store = createStore(0, createLogger());
		const listener = vi.fn();

		store.subscribe(listener);
		store.setState(() => 1);
		store.setState(() => 2);

		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("should expose the new state to the listener", () => {
		const store = createStore(0, createLogger());
		const seen: number[] = [];

		store.subscribe(() => seen.push(store.getState()));
		store.setState(() => 1);

		expect(seen).toEqual([1]);
	});

	it("should not notify when the state is unchanged", () => {
		const state = { count: 0 };
		const store = createStore(state, createLogger());
		const listener = vi.fn();

		store.subscribe(listener);
		store.setState(() => state);
		store.setState((previous) => previous);

		expect(listener).not.toHaveBeenCalled();
		expect(store.getState()).toBe(state);
	});

	it("should notify for an equal but distinct state", () => {
		const store = createStore({ count: 0 }, createLogger());
		const listener = vi.fn();

		store.subscribe(listener);
		store.setState(() => ({ count: 0 }));

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("should notify subscribers in subscription order", () => {
		const store = createStore(0, createLogger());
		const order: string[] = [];

		store.subscribe(() => order.push("first"));
		store.subscribe(() => order.push("second"));
		store.setState(() => 1);

		expect(order).toEqual(["first", "second"]);
	});

	it("should call a listener once per registration", () => {
		const store = createStore(0, createLogger());
		const listener = vi.fn();

		store.subscribe(listener);
		store.subscribe(listener);
		store.setState(() => 1);

		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("should remove only its own registration of a shared listener", () => {
		const store = createStore(0, createLogger());
		const listener = vi.fn();
		const unsubscribeFirst = store.subscribe(listener);
		store.subscribe(listener);

		unsubscribeFirst();
		store.setState(() => 1);

		expect(listener).toHaveBeenCalledOnce();
	});

	it("should keep a new registration when a stale unsubscribe runs", () => {
		const store = createStore(0, createLogger());
		const listener = vi.fn();
		const staleUnsubscribe = store.subscribe(listener);
		staleUnsubscribe();
		store.subscribe(listener);

		staleUnsubscribe();
		store.setState(() => 1);

		expect(listener).toHaveBeenCalledOnce();
	});

	it("should stop notifying after unsubscribe", () => {
		const store = createStore(0, createLogger());
		const listener = vi.fn();

		const unsubscribe = store.subscribe(listener);
		unsubscribe();
		store.setState(() => 1);

		expect(listener).not.toHaveBeenCalled();
	});

	it("should ignore a repeated unsubscribe", () => {
		const store = createStore(0, createLogger());
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);
		const other = store.subscribe(listener);

		unsubscribe();
		unsubscribe();
		other();
		store.setState(() => 1);

		expect(listener).not.toHaveBeenCalled();
	});

	it("should skip a listener unsubscribed during a notification", () => {
		const store = createStore(0, createLogger());
		const second = vi.fn();

		store.subscribe(() => unsubscribeSecond());
		const unsubscribeSecond = store.subscribe(second);
		store.setState(() => 1);

		expect(second).not.toHaveBeenCalled();
	});

	it("should skip only the registration of a shared listener unsubscribed during a notification", () => {
		const store = createStore(0, createLogger());
		const shared = vi.fn();

		store.subscribe(() => unsubscribeSecond());
		store.subscribe(shared);
		const unsubscribeSecond = store.subscribe(shared);
		store.setState(() => 1);

		expect(shared).toHaveBeenCalledOnce();
	});

	it("should skip a listener subscribed during a notification", () => {
		const store = createStore(0, createLogger());
		const late = vi.fn();

		store.subscribe(() => store.subscribe(late));
		store.setState(() => 1);

		expect(late).not.toHaveBeenCalled();

		store.setState(() => 2);

		expect(late).toHaveBeenCalledTimes(1);
	});

	it("should apply a nested transition synchronously", () => {
		const store = createStore(0, createLogger());
		const seen: number[] = [];

		store.subscribe(() => {
			seen.push(store.getState());
			if (store.getState() === 1) store.setState(() => 2);
		});
		store.setState(() => 1);

		expect(seen).toEqual([1, 2]);
		expect(store.getState()).toBe(2);
	});

	it("should report a throwing listener and keep notifying the rest", () => {
		const logger = createLogger();
		const store = createStore(0, logger);
		const failure = new Error("listener failed");
		const later = vi.fn();

		store.subscribe(() => {
			throw failure;
		});
		store.subscribe(later);

		expect(() => store.setState(() => 1)).not.toThrow();
		expect(store.getState()).toBe(1);
		expect(later).toHaveBeenCalledOnce();
		expect(logger.error).toHaveBeenCalledWith(
			"A store listener threw",
			failure,
		);
	});
});
