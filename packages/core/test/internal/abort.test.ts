import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AbortedError, TimeoutError } from "../../src/errors.js";
import {
	combineSignals,
	isTimeoutMs,
	withTimeout,
} from "../../src/internal/abort.js";

/** A promise that settles only through its returned handles. */
function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
} {
	let resolve: (value: T) => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("isTimeoutMs", () => {
	it.each([1, 30_000, 2 ** 31 - 1])("should accept %s", (value) => {
		expect(isTimeoutMs(value)).toBe(true);
	});

	it.each([
		0,
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		2 ** 31,
		"30000",
		undefined,
	])("should reject %s", (value) => {
		expect(isTimeoutMs(value)).toBe(false);
	});
});

describe("combineSignals", () => {
	it("should not abort while no input aborts", () => {
		const combined = combineSignals([
			new AbortController().signal,
			new AbortController().signal,
		]);

		expect(combined.signal.aborted).toBe(false);
	});

	it("should abort with the reason of the input that aborts", () => {
		const first = new AbortController();
		const second = new AbortController();
		const combined = combineSignals([first.signal, second.signal]);

		second.abort("second");

		expect(combined.signal.aborted).toBe(true);
		expect(combined.signal.reason).toBe("second");
	});

	it("should keep the first reason when a later input aborts too", () => {
		const first = new AbortController();
		const second = new AbortController();
		const combined = combineSignals([first.signal, second.signal]);

		first.abort("first");
		second.abort("second");

		expect(combined.signal.reason).toBe("first");
	});

	it("should abort synchronously on an already aborted input", () => {
		const aborted = new AbortController();
		aborted.abort("already");

		const combined = combineSignals([
			new AbortController().signal,
			aborted.signal,
		]);

		expect(combined.signal.aborted).toBe(true);
		expect(combined.signal.reason).toBe("already");
	});

	it("should skip undefined inputs", () => {
		const input = new AbortController();
		const combined = combineSignals([undefined, input.signal]);

		input.abort("reason");

		expect(combined.signal.reason).toBe("reason");
	});

	it("should never abort with no inputs", () => {
		expect(combineSignals([]).signal.aborted).toBe(false);
	});

	it("should stop following the inputs after release", () => {
		const input = new AbortController();
		const combined = combineSignals([input.signal]);

		combined.release();
		input.abort("late");

		expect(combined.signal.aborted).toBe(false);
	});

	it("should remove every listener it added on release", () => {
		const first = new AbortController();
		const second = new AbortController();
		const removeFirst = vi.spyOn(first.signal, "removeEventListener");
		const removeSecond = vi.spyOn(second.signal, "removeEventListener");
		const combined = combineSignals([first.signal, second.signal]);

		combined.release();

		expect(removeFirst).toHaveBeenCalledWith("abort", expect.any(Function));
		expect(removeSecond).toHaveBeenCalledWith("abort", expect.any(Function));
	});

	it("should remove its listeners from every input once one aborts", () => {
		const first = new AbortController();
		const second = new AbortController();
		const removeSecond = vi.spyOn(second.signal, "removeEventListener");
		combineSignals([first.signal, second.signal]);

		first.abort("first");

		expect(removeSecond).toHaveBeenCalledWith("abort", expect.any(Function));
	});
});

describe("withTimeout", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should resolve with the result of run", async () => {
		await expect(
			withTimeout(async () => "value", { timeoutMessage: "timed out" }),
		).resolves.toBe("value");
	});

	it("should reject with the rejection of run", async () => {
		const failure = new Error("failed");

		await expect(
			withTimeout(() => Promise.reject(failure), {
				timeoutMessage: "timed out",
			}),
		).rejects.toBe(failure);
	});

	it("should pass run a signal that is not aborted", async () => {
		let received: AbortSignal | undefined;

		await withTimeout(
			async (signal) => {
				received = signal;
			},
			{ timeoutMessage: "timed out" },
		);

		expect(received?.aborted).toBe(false);
	});

	it("should reject with a TimeoutError once timeoutMs elapses", async () => {
		const pending = withTimeout(() => deferred<string>().promise, {
			timeoutMs: 1000,
			timeoutMessage: "connect() timed out",
		});
		const outcome = expect(pending).rejects.toThrow(TimeoutError);

		await vi.advanceTimersByTimeAsync(1000);

		await outcome;
		await expect(pending).rejects.toThrow("connect() timed out");
	});

	it("should not time out before timeoutMs elapses", async () => {
		const run = deferred<string>();
		const pending = withTimeout(() => run.promise, {
			timeoutMs: 1000,
			timeoutMessage: "timed out",
		});

		await vi.advanceTimersByTimeAsync(999);
		run.resolve("value");

		await expect(pending).resolves.toBe("value");
	});

	it("should abort the signal passed to run with the TimeoutError", async () => {
		let received: AbortSignal | undefined;
		const pending = withTimeout(
			(signal) => {
				received = signal;
				return deferred<string>().promise;
			},
			{ timeoutMs: 1000, timeoutMessage: "timed out" },
		);
		const outcome = expect(pending).rejects.toThrow(TimeoutError);

		await vi.advanceTimersByTimeAsync(1000);

		await outcome;
		expect(received?.reason).toBeInstanceOf(TimeoutError);
	});

	it("should run no timer without timeoutMs", async () => {
		const run = deferred<string>();
		const pending = withTimeout(() => run.promise, {
			timeoutMessage: "timed out",
		});

		expect(vi.getTimerCount()).toBe(0);
		run.resolve("value");
		await expect(pending).resolves.toBe("value");
	});

	it("should reject with an AbortedError when the caller aborts", async () => {
		const caller = new AbortController();
		const pending = withTimeout(() => deferred<string>().promise, {
			signal: caller.signal,
			timeoutMessage: "timed out",
		});

		caller.abort("user closed the modal");

		await expect(pending).rejects.toThrow(AbortedError);
		await expect(pending).rejects.toMatchObject({
			cause: "user closed the modal",
		});
	});

	it("should abort the signal passed to run with the caller's reason", async () => {
		const caller = new AbortController();
		let received: AbortSignal | undefined;
		const pending = withTimeout(
			(signal) => {
				received = signal;
				return deferred<string>().promise;
			},
			{ signal: caller.signal, timeoutMessage: "timed out" },
		);

		caller.abort("reason");

		await expect(pending).rejects.toThrow(AbortedError);
		expect(received?.reason).toBe("reason");
	});

	it("should reject without calling run when the caller already aborted", async () => {
		const caller = new AbortController();
		caller.abort("already");
		const run = vi.fn(() => deferred<string>().promise);

		await expect(
			withTimeout(run, { signal: caller.signal, timeoutMessage: "timed out" }),
		).rejects.toMatchObject({ code: "ABORTED", cause: "already" });
		expect(run).not.toHaveBeenCalled();
	});

	it("should keep the timeout when the caller aborts after it", async () => {
		const caller = new AbortController();
		const pending = withTimeout(() => deferred<string>().promise, {
			signal: caller.signal,
			timeoutMs: 1000,
			timeoutMessage: "timed out",
		});
		const outcome = expect(pending).rejects.toThrow(TimeoutError);

		await vi.advanceTimersByTimeAsync(1000);
		caller.abort("late");

		await outcome;
	});

	it("should ignore run settling after the caller aborted", async () => {
		const caller = new AbortController();
		const run = deferred<string>();
		const pending = withTimeout(() => run.promise, {
			signal: caller.signal,
			timeoutMessage: "timed out",
		});

		caller.abort("reason");
		run.resolve("late value");

		await expect(pending).rejects.toThrow(AbortedError);
	});

	it("should clear its timer once run settles", async () => {
		await withTimeout(async () => "value", {
			timeoutMs: 1000,
			timeoutMessage: "timed out",
		});

		expect(vi.getTimerCount()).toBe(0);
	});

	it("should clear its timer when the caller aborts", async () => {
		const caller = new AbortController();
		const pending = withTimeout(() => deferred<string>().promise, {
			signal: caller.signal,
			timeoutMs: 1000,
			timeoutMessage: "timed out",
		});

		caller.abort("reason");
		await expect(pending).rejects.toThrow(AbortedError);

		expect(vi.getTimerCount()).toBe(0);
	});

	it("should stop listening to the caller's signal once settled", async () => {
		const caller = new AbortController();
		const remove = vi.spyOn(caller.signal, "removeEventListener");

		await withTimeout(async () => "value", {
			signal: caller.signal,
			timeoutMessage: "timed out",
		});

		expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
	});
});
