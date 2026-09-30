import { describe, expect, it, vi } from "vitest";
import { createEmitter } from "../../src/client/events.js";
import type { Logger } from "../../src/types/protocol.js";

function createLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

const disconnected = { sessionId: "session-1", reason: "user" } as const;

describe("createEmitter", () => {
	it("should call a listener with the emitted payload", () => {
		const events = createEmitter(createLogger());
		const listener = vi.fn();
		events.on("session:disconnected", listener);

		events.emit("session:disconnected", disconnected);

		expect(listener).toHaveBeenCalledExactlyOnceWith(disconnected);
	});

	it("should call only the listeners of the emitted event", () => {
		const events = createEmitter(createLogger());
		const listener = vi.fn();
		events.on("request:settled", listener);

		events.emit("session:disconnected", disconnected);

		expect(listener).not.toHaveBeenCalled();
	});

	it("should do nothing when an event has no listeners", () => {
		const events = createEmitter(createLogger());

		expect(() =>
			events.emit("session:disconnected", disconnected),
		).not.toThrow();
	});

	it("should call listeners in subscription order", () => {
		const events = createEmitter(createLogger());
		const calls: string[] = [];
		events.on("session:disconnected", () => calls.push("first"));
		events.on("session:disconnected", () => calls.push("second"));

		events.emit("session:disconnected", disconnected);

		expect(calls).toEqual(["first", "second"]);
	});

	it("should call a listener once per registration", () => {
		const events = createEmitter(createLogger());
		const listener = vi.fn();
		events.on("session:disconnected", listener);
		events.on("session:disconnected", listener);

		events.emit("session:disconnected", disconnected);

		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("should remove only its own registration of a shared listener", () => {
		const events = createEmitter(createLogger());
		const listener = vi.fn();
		const offFirst = events.on("session:disconnected", listener);
		events.on("session:disconnected", listener);

		offFirst();
		events.emit("session:disconnected", disconnected);

		expect(listener).toHaveBeenCalledOnce();
	});

	it("should keep a new registration when a stale unsubscribe runs", () => {
		const events = createEmitter(createLogger());
		const listener = vi.fn();
		const staleOff = events.on("session:disconnected", listener);
		staleOff();
		events.on("session:disconnected", listener);

		staleOff();
		events.emit("session:disconnected", disconnected);

		expect(listener).toHaveBeenCalledOnce();
	});

	it("should stop calling a listener after it unsubscribes", () => {
		const events = createEmitter(createLogger());
		const listener = vi.fn();
		const off = events.on("session:disconnected", listener);

		off();
		events.emit("session:disconnected", disconnected);

		expect(listener).not.toHaveBeenCalled();
	});

	it("should ignore a second unsubscribe", () => {
		const events = createEmitter(createLogger());
		const listener = vi.fn();
		const off = events.on("session:disconnected", listener);

		off();
		off();
		events.on("session:disconnected", listener);
		events.emit("session:disconnected", disconnected);

		expect(listener).toHaveBeenCalledOnce();
	});

	it("should not call a listener subscribed during the same emit", () => {
		const events = createEmitter(createLogger());
		const late = vi.fn();
		events.on("session:disconnected", () => {
			events.on("session:disconnected", late);
		});

		events.emit("session:disconnected", disconnected);

		expect(late).not.toHaveBeenCalled();
	});

	it("should skip a listener unsubscribed earlier in the same emit", () => {
		const events = createEmitter(createLogger());
		const second = vi.fn();
		let offSecond = (): void => {};
		events.on("session:disconnected", () => offSecond());
		offSecond = events.on("session:disconnected", second);

		events.emit("session:disconnected", disconnected);

		expect(second).not.toHaveBeenCalled();
	});

	it("should log a throwing listener and keep calling the rest", () => {
		const logger = createLogger();
		const events = createEmitter(logger);
		const failure = new Error("listener bug");
		const after = vi.fn();
		events.on("session:disconnected", () => {
			throw failure;
		});
		events.on("session:disconnected", after);

		expect(() =>
			events.emit("session:disconnected", disconnected),
		).not.toThrow();
		expect(after).toHaveBeenCalledOnce();
		expect(logger.error).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining("session:disconnected"),
			failure,
		);
	});

	it("should not emit client:error for a throwing listener", () => {
		const events = createEmitter(createLogger());
		const onError = vi.fn();
		events.on("client:error", onError);
		events.on("session:disconnected", () => {
			throw new Error("listener bug");
		});

		events.emit("session:disconnected", disconnected);

		expect(onError).not.toHaveBeenCalled();
	});

	it("should remove every listener of every event on clear", () => {
		const events = createEmitter(createLogger());
		const onDisconnected = vi.fn();
		const onSettled = vi.fn();
		events.on("session:disconnected", onDisconnected);
		events.on("request:settled", onSettled);

		events.clear();
		events.emit("session:disconnected", disconnected);
		events.emit("request:settled", {
			id: "request-1",
			sessionId: "session-1",
			outcome: "resolved",
		});

		expect(onDisconnected).not.toHaveBeenCalled();
		expect(onSettled).not.toHaveBeenCalled();
	});

	it("should skip the remaining listeners when cleared during an emit", () => {
		const events = createEmitter(createLogger());
		const second = vi.fn();
		events.on("session:disconnected", () => events.clear());
		events.on("session:disconnected", second);

		events.emit("session:disconnected", disconnected);

		expect(second).not.toHaveBeenCalled();
	});

	it("should accept new listeners after clear", () => {
		const events = createEmitter(createLogger());
		const listener = vi.fn();
		events.clear();

		events.on("session:disconnected", listener);
		events.emit("session:disconnected", disconnected);

		expect(listener).toHaveBeenCalledOnce();
	});
});
