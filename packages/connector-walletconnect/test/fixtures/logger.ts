import type { Logger } from "@bchconnect/core";
import { type Mock, vi } from "vitest";

/** A logger whose every level is a spy. */
export interface SpyLogger extends Logger {
	debug: Mock<Logger["debug"]>;
	info: Mock<Logger["info"]>;
	warn: Mock<Logger["warn"]>;
	error: Mock<Logger["error"]>;
}

/** Builds a logger that records every call. */
export function spyLogger(): SpyLogger {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** Every argument any level was called with, as one string per call. */
export function loggedText(logger: SpyLogger): string[] {
	return [logger.debug, logger.info, logger.warn, logger.error].flatMap(
		(level) =>
			level.mock.calls.map((args) =>
				args
					.map((arg) =>
						arg instanceof Error
							? `${arg.message} ${String(arg.cause)}`
							: typeof arg === "string"
								? arg
								: JSON.stringify(arg),
					)
					.join(" "),
			),
	);
}
