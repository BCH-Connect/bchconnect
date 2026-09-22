import { describe, expectTypeOf, it } from "vitest";
import type { Session } from "../../src/index.js";
import {
	client,
	type NineWizard,
	nineClient,
	type TestCashConnect,
	type TestSession,
} from "./fixtures/client.js";
import type {
	Alpha,
	Bravo,
	Charlie,
	Delta,
	Echo,
	Foxtrot,
} from "./fixtures/stress/index.js";
import type { Wc2 } from "./fixtures/wc2.js";

describe("client inference", () => {
	it("should type current as the exact union of registered sessions", () => {
		expectTypeOf(client.current).toEqualTypeOf<TestSession | null>();
	});

	it("should type sessions with the same union", () => {
		expectTypeOf(client.sessions).toEqualTypeOf<
			ReadonlyMap<string, TestSession>
		>();
	});

	it("should not accept a loose Session in the registered union", () => {
		expectTypeOf<Session>().not.toExtend<TestSession>();
	});

	it("should not accept a session of an unregistered protocol", () => {
		interface Unregistered extends Omit<Wc2, "id"> {
			id: "not-registered";
		}
		expectTypeOf<Session<Unregistered>>().not.toExtend<TestSession>();
	});
});

describe("client inference at nine protocols", () => {
	it("should keep the exact union", () => {
		expectTypeOf(nineClient.current).toEqualTypeOf<
			| Session<NineWizard>
			| Session<Wc2>
			| Session<TestCashConnect>
			| Session<Alpha>
			| Session<Bravo>
			| Session<Charlie>
			| Session<Delta>
			| Session<Echo>
			| Session<Foxtrot>
			| null
		>();
	});

	it("should narrow connect() to one protocol", () => {
		expectTypeOf(nineClient.connect("delta")).resolves.toEqualTypeOf<
			Session<Delta>
		>();
	});

	it("should type a request on a stress protocol", () => {
		const session = nineClient.session("echo");
		if (session === null) return;
		expectTypeOf(
			nineClient.request(session, "echo_method7", {
				field7: "a",
				count7: 1,
				blob7: new Uint8Array(),
			}),
		).resolves.toEqualTypeOf<{
			readonly ok: boolean;
			readonly payload7: { readonly a: string; readonly b: bigint };
		}>();
	});
});
