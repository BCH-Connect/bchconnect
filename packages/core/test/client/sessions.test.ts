import type { DemoProtocol } from "@bchconnect/test-utils";
import { createFakeConnector, demoSession } from "@bchconnect/test-utils";
import { describe, expect, it } from "vitest";

describe("sessions", () => {
	it("should build a scripted connector from the test utilities", () => {
		const connector = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			session: demoSession,
		});

		expect(connector.protocol).toBe("demo");
		expect(connector.log).toEqual([]);
	});

	it.todo("should never mutate a session object after emission");
});
