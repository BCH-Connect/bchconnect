import { describe, expect, it } from "vitest";
import {
	type DemoProtocol,
	demoAltSession,
	demoSession,
	fakeSession,
} from "../src/index.js";

describe("fakeSession", () => {
	it("should fill id, wallet and status", () => {
		const session = fakeSession<DemoProtocol>({
			protocol: "demo",
			data: { addresses: [], xpubs: [] },
		});

		expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(session.wallet).toEqual({ source: "protocol" });
		expect(session.status).toEqual({
			transport: "connected",
			peer: "reachable",
		});
	});

	it("should mint a fresh id per call", () => {
		const first = fakeSession<DemoProtocol>({
			protocol: "demo",
			data: { addresses: [], xpubs: [] },
		});
		const second = fakeSession<DemoProtocol>({
			protocol: "demo",
			data: { addresses: [], xpubs: [] },
		});

		expect(first.id).not.toBe(second.id);
	});

	it("should keep what the caller supplied", () => {
		const session = fakeSession<DemoProtocol>({
			id: "s1",
			protocol: "demo",
			data: {
				addresses: ["bitcoincash:qpea4gc3r589sdqdcprsu6uyxpugpqnshsa8v7vsxq"],
				xpubs: [],
			},
			wallet: { name: "Cashonize", source: "selection" },
			status: { transport: "reconnecting", peer: "unknown" },
		});

		expect(session).toEqual({
			id: "s1",
			protocol: "demo",
			data: {
				addresses: ["bitcoincash:qpea4gc3r589sdqdcprsu6uyxpugpqnshsa8v7vsxq"],
				xpubs: [],
			},
			wallet: { name: "Cashonize", source: "selection" },
			status: { transport: "reconnecting", peer: "unknown" },
		});
	});
});

describe("demo session builders", () => {
	it("should build sessions of their own protocol", () => {
		expect(demoSession().protocol).toBe("demo");
		expect(demoAltSession().protocol).toBe("demo-alt");
	});

	it("should accept overrides", () => {
		const session = demoSession({
			id: "s1",
			data: { addresses: [], xpubs: [] },
		});

		expect(session.id).toBe("s1");
		expect(session.data).toEqual({ addresses: [], xpubs: [] });
	});

	it("should carry placeholder data by default", () => {
		expect(demoSession().data.addresses).toHaveLength(1);
		expect(demoAltSession().data.pubkey).toBeInstanceOf(Uint8Array);
	});
});
