import { describe, expect, it, vi } from "vitest";
import { createStore } from "../src/store.js";

describe("createStore", () => {
	it("should hold the initial state", () => {
		const initial = { count: 0 };

		expect(createStore(initial).getState()).toBe(initial);
	});

	it("should replace the state with the updater's result", () => {
		const store = createStore({ count: 0 });
		const next = { count: 1 };

		store.setState(() => next);

		expect(store.getState()).toBe(next);
	});

	it("should pass the current state to the updater", () => {
		const store = createStore({ count: 1 });

		store.setState((previous) => ({ count: previous.count + 1 }));

		expect(store.getState()).toEqual({ count: 2 });
	});

	it("should notify a subscriber once per transition", () => {
		const store = createStore(0);
		const listener = vi.fn();

		store.subscribe(listener);
		store.setState(() => 1);
		store.setState(() => 2);

		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("should expose the new state to the listener", () => {
		const store = createStore(0);
		const seen: number[] = [];

		store.subscribe(() => seen.push(store.getState()));
		store.setState(() => 1);

		expect(seen).toEqual([1]);
	});

	it("should not notify when the state is unchanged", () => {
		const state = { count: 0 };
		const store = createStore(state);
		const listener = vi.fn();

		store.subscribe(listener);
		store.setState(() => state);
		store.setState((previous) => previous);

		expect(listener).not.toHaveBeenCalled();
		expect(store.getState()).toBe(state);
	});

	it("should notify for an equal but distinct state", () => {
		const store = createStore({ count: 0 });
		const listener = vi.fn();

		store.subscribe(listener);
		store.setState(() => ({ count: 0 }));

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("should notify subscribers in subscription order", () => {
		const store = createStore(0);
		const order: string[] = [];

		store.subscribe(() => order.push("first"));
		store.subscribe(() => order.push("second"));
		store.setState(() => 1);

		expect(order).toEqual(["first", "second"]);
	});

	it("should subscribe the same listener once", () => {
		const store = createStore(0);
		const listener = vi.fn();

		store.subscribe(listener);
		store.subscribe(listener);
		store.setState(() => 1);

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("should stop notifying after unsubscribe", () => {
		const store = createStore(0);
		const listener = vi.fn();

		const unsubscribe = store.subscribe(listener);
		unsubscribe();
		store.setState(() => 1);

		expect(listener).not.toHaveBeenCalled();
	});

	it("should ignore a repeated unsubscribe", () => {
		const store = createStore(0);
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
		const store = createStore(0);
		const second = vi.fn();

		store.subscribe(() => unsubscribeSecond());
		const unsubscribeSecond = store.subscribe(second);
		store.setState(() => 1);

		expect(second).not.toHaveBeenCalled();
	});

	it("should skip a listener subscribed during a notification", () => {
		const store = createStore(0);
		const late = vi.fn();

		store.subscribe(() => store.subscribe(late));
		store.setState(() => 1);

		expect(late).not.toHaveBeenCalled();

		store.setState(() => 2);

		expect(late).toHaveBeenCalledTimes(1);
	});

	it("should apply a nested transition synchronously", () => {
		const store = createStore(0);
		const seen: number[] = [];

		store.subscribe(() => {
			seen.push(store.getState());
			if (store.getState() === 1) store.setState(() => 2);
		});
		store.setState(() => 1);

		expect(seen).toEqual([1, 2]);
		expect(store.getState()).toBe(2);
	});

	it("should propagate an error thrown by a listener", () => {
		const store = createStore(0);
		const later = vi.fn();

		store.subscribe(() => {
			throw new Error("listener failed");
		});
		store.subscribe(later);

		expect(() => store.setState(() => 1)).toThrow("listener failed");
		expect(store.getState()).toBe(1);
		expect(later).not.toHaveBeenCalled();
	});
});
