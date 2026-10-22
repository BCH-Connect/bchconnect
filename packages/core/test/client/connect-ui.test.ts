import type { DemoAltProtocol, DemoProtocol } from "@bchconnect/test-utils";
import {
	createFakeConnector,
	demoAltSession,
	demoSession,
} from "@bchconnect/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import type { ConnectUi, ConnectUiContext } from "../../src/types/client.js";
import type { Connector } from "../../src/types/protocol.js";

const appMetadata = { name: "Test", url: "https://example.com" };
const pairing = { kind: "uri", uri: "demo:pair" } as const;

function demo() {
	return createFakeConnector<DemoProtocol>({
		protocol: "demo",
		session: () => demoSession({ id: crypto.randomUUID() }),
		pairing,
	});
}

function alt() {
	return createFakeConnector<DemoAltProtocol>({
		protocol: "demo-alt",
		session: demoAltSession({ id: "alt" }),
	});
}

// Lets background work run.
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

function configError(message: string) {
	return expect.objectContaining({ code: "CONFIG", message });
}

// A UI that connects over `protocol` and records the context it was given.
function scriptedUi(protocol = "demo") {
	const contexts: ConnectUiContext[] = [];
	const pairings: unknown[] = [];
	const ui: ConnectUi = {
		connect(context) {
			contexts.push(context);
			return context.connect(protocol, {
				signal: new AbortController().signal,
				onPairing: (value) => pairings.push(value),
			});
		},
	};
	return { ui, contexts, pairings };
}

async function setup(ui?: ConnectUi, connectors: readonly Connector[] = []) {
	const connector = demo();
	const client = createClient({
		connectors: [connector, ...connectors],
		network: "chipnet",
		appMetadata,
		...(ui === undefined ? {} : { ui }),
	});
	await client.init();
	return { client, connector };
}

describe("connect without a protocol", () => {
	it("should reject CONFIG when the client has no ui", async () => {
		const { client, connector } = await setup();

		await expect(client.connect()).rejects.toEqual(
			configError("connect() needs a protocol unless a ui handles it"),
		);
		expect(connector.log).not.toContainEqual(
			expect.objectContaining({ kind: "connect" }),
		);
	});

	it("should resolve with the session the ui connected, made current", async () => {
		const { ui, pairings } = scriptedUi();
		const { client } = await setup(ui);

		const session = await client.connect();

		expect(session.protocol).toBe("demo");
		expect(client.current).toBe(session);
		expect(pairings).toEqual([pairing]);
	});

	it("should hand the ui the usable protocols, the network and no locked protocol", async () => {
		const { ui, contexts } = scriptedUi();
		const broken = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
			setup: "throw",
		});
		const { client } = await setup(ui, [broken]);

		await client.connect();

		expect(contexts).toHaveLength(1);
		expect(contexts[0]?.protocols).toEqual(["demo"]);
		expect(contexts[0]?.network).toBe("chipnet");
		expect(contexts[0]?.protocol).toBeNull();
	});

	it("should reject CONFIG before init() was called", async () => {
		const { ui, contexts } = scriptedUi();
		const client = createClient({
			connectors: [demo()],
			network: "chipnet",
			appMetadata,
			ui,
		});

		await expect(client.connect()).rejects.toEqual(
			configError("connect() was called before init()"),
		);
		expect(contexts).toEqual([]);
	});

	it("should reject CONFIG for an invalid timeoutMs without opening the ui", async () => {
		const { ui, contexts } = scriptedUi();
		const { client } = await setup(ui);

		await expect(client.connect(undefined, { timeoutMs: -1 })).rejects.toEqual(
			configError("Invalid timeoutMs: -1"),
		);
		expect(contexts).toEqual([]);
	});
});

describe("connect through a ui", () => {
	it("should lock the ui to the protocol the caller passed", async () => {
		const { ui, contexts } = scriptedUi();
		const { client } = await setup(ui, [alt()]);

		const session = await client.connect("demo");

		expect(session.protocol).toBe("demo");
		expect(contexts[0]?.protocol).toBe("demo");
	});

	it("should reject CONFIG for an attempt over another protocol than the locked one", async () => {
		const { ui } = scriptedUi("demo-alt");
		const { client } = await setup(ui, [alt()]);

		await expect(client.connect("demo")).rejects.toEqual(
			configError('The ui may only connect over "demo"'),
		);
		expect(client.sessions.size).toBe(0);
	});

	it("should reject CONFIG for an unregistered protocol without opening the ui", async () => {
		const { ui, contexts } = scriptedUi();
		const { client } = await setup(ui);

		await expect(client.connect("nope")).rejects.toEqual(
			configError("Unknown protocol: nope"),
		);
		expect(contexts).toEqual([]);
	});

	it("should leave the ui out when the caller renders the pairing", async () => {
		const { ui, contexts } = scriptedUi();
		const { client, connector } = await setup(ui);
		const onPairing = vi.fn();

		await client.connect("demo", { onPairing });

		expect(contexts).toEqual([]);
		expect(onPairing).toHaveBeenCalledWith(pairing);
		expect(connector.log).toContainEqual(
			expect.objectContaining({ kind: "connect" }),
		);
	});

	it("should reject CONFIG for a second ui call while one is open, leaving the first", async () => {
		let release: () => void = () => {};
		const ui: ConnectUi = {
			async connect(context) {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return context.connect("demo", {
					signal: new AbortController().signal,
					onPairing() {},
				});
			},
		};
		const { client } = await setup(ui);

		const first = client.connect();
		await expect(client.connect()).rejects.toEqual(
			configError("The ui is already handling a connect()"),
		);
		await settle();
		release();

		await expect(first).resolves.toMatchObject({ protocol: "demo" });
		const again = client.connect();
		await settle();
		release();
		await expect(again).resolves.toMatchObject({ protocol: "demo" });
	});

	it("should apply the caller's timeoutMs and mode to each attempt", async () => {
		const { ui } = scriptedUi();
		const { client, connector } = await setup(ui);
		const kept = await client.connect("demo", { onPairing() {} });

		await client.connect(undefined, { timeoutMs: 5_000, mode: "add" });

		expect(client.sessions.has(kept.id)).toBe(true);
		const last = connector.log.at(-1);
		expect(last).toMatchObject({ kind: "connect" });
		expect(last?.kind === "connect" && last.timeoutMs).toBeGreaterThan(0);
		expect(last?.kind === "connect" && last.timeoutMs).toBeLessThanOrEqual(
			5_000,
		);
	});

	it("should name the session after the wallet the ui selected", async () => {
		const ui: ConnectUi = {
			connect(context) {
				return context.connect("demo-alt", {
					signal: new AbortController().signal,
					onPairing() {},
					wallet: { id: "cashonize", name: "Cashonize" },
				});
			},
		};
		const { client } = await setup(ui, [alt()]);

		const session = await client.connect();

		expect(session.wallet).toMatchObject({
			name: "Cashonize",
			source: "selection",
		});
	});

	it("should abort the ui's signal when the caller aborts", async () => {
		const controller = new AbortController();
		let seen: AbortSignal | undefined;
		const ui: ConnectUi = {
			connect(context) {
				seen = context.signal;
				return new Promise((_, reject) => {
					context.signal.addEventListener("abort", () =>
						reject(context.signal.reason),
					);
				});
			},
		};
		const { client } = await setup(ui);

		const call = client.connect(undefined, { signal: controller.signal });
		await settle();
		controller.abort();

		await expect(call).rejects.toMatchObject({ code: "ABORTED" });
		expect(seen?.aborted).toBe(true);
	});

	it("should abort the ui's signal on dispose()", async () => {
		let seen: AbortSignal | undefined;
		const ui: ConnectUi = {
			connect(context) {
				seen = context.signal;
				return new Promise((_, reject) => {
					context.signal.addEventListener("abort", () =>
						reject(context.signal.reason),
					);
				});
			},
		};
		const { client } = await setup(ui);

		const call = client.connect();
		await settle();
		await client.dispose();

		await expect(call).rejects.toMatchObject({ code: "ABORTED" });
		expect(seen?.aborted).toBe(true);
	});

	it("should reject ABORTED at once when the caller aborts, even if the ui is slow to close", async () => {
		const controller = new AbortController();
		const ui: ConnectUi = { connect: () => new Promise(() => {}) };
		const { client } = await setup(ui);

		const call = client.connect(undefined, { signal: controller.signal });
		await settle();
		controller.abort();

		await expect(call).rejects.toMatchObject({ code: "ABORTED" });
		await expect(client.connect()).rejects.toEqual(
			configError("The ui is already handling a connect()"),
		);
	});

	it("should reject ABORTED without opening the ui for an already aborted signal", async () => {
		const { ui, contexts } = scriptedUi();
		const { client } = await setup(ui);

		await expect(
			client.connect(undefined, { signal: AbortSignal.abort() }),
		).rejects.toMatchObject({ code: "ABORTED" });
		expect(contexts).toEqual([]);
		await expect(client.connect()).resolves.toMatchObject({ protocol: "demo" });
	});

	it("should reject CONFIG for a second ui call made while the first waits for init()", async () => {
		const { ui, contexts } = scriptedUi();
		const client = createClient({
			connectors: [demo()],
			network: "chipnet",
			appMetadata,
			ui,
		});
		const init = client.init();

		const first = client.connect();
		await expect(client.connect()).rejects.toEqual(
			configError("The ui is already handling a connect()"),
		);
		await init;

		await expect(first).resolves.toMatchObject({ protocol: "demo" });
		expect(contexts).toHaveLength(1);
	});

	it("should reject CONFIG without a protocol when the caller renders the pairing", async () => {
		const { ui, contexts } = scriptedUi();
		const { client } = await setup(ui);

		await expect(client.connect(undefined, { onPairing() {} })).rejects.toEqual(
			configError("connect() needs a protocol unless a ui handles it"),
		);
		expect(contexts).toEqual([]);
	});

	it("should reject CONFIG without opening the ui for a locked protocol whose setup failed", async () => {
		const { ui, contexts } = scriptedUi();
		const broken = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
			setup: "throw",
		});
		const { client } = await setup(ui, [broken]);

		await expect(client.connect("demo-alt")).rejects.toEqual(
			configError('Connector "demo-alt" failed setup'),
		);
		expect(contexts).toEqual([]);
	});

	it("should let the ui abort an attempt and retry over the same protocol", async () => {
		const ui: ConnectUi = {
			async connect(context) {
				const first = new AbortController();
				const attempt = context.connect("demo", {
					signal: first.signal,
					onPairing: () => first.abort(),
				});
				await expect(attempt).rejects.toMatchObject({ code: "ABORTED" });
				return context.connect("demo", {
					signal: new AbortController().signal,
					onPairing() {},
				});
			},
		};
		let calls = 0;
		const retrying = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			pairing,
			connect: (opts) => {
				calls += 1;
				return calls === 1
					? new Promise((_, reject) =>
							opts.signal?.addEventListener("abort", () =>
								reject(opts.signal?.reason),
							),
						)
					: Promise.resolve(demoSession({ id: "retried" }));
			},
		});
		const client = createClient({
			connectors: [retrying],
			network: "chipnet",
			appMetadata,
			ui,
		});
		await client.init();

		await expect(client.connect()).resolves.toMatchObject({ id: "retried" });
		expect(calls).toBe(2);
	});

	it("should refuse an attempt the ui starts after the call has ended", async () => {
		const controller = new AbortController();
		let late: Promise<unknown> | undefined;
		const ui: ConnectUi = {
			connect(context) {
				return new Promise((_, reject) => {
					context.signal.addEventListener("abort", () => {
						reject(context.signal.reason);
						setTimeout(() => {
							late = context.connect("demo", {
								signal: new AbortController().signal,
								onPairing() {},
							});
						});
					});
				});
			},
		};
		const { client } = await setup(ui);

		const call = client.connect(undefined, { signal: controller.signal });
		await settle();
		controller.abort();

		await expect(call).rejects.toMatchObject({ code: "ABORTED" });
		await settle();
		await expect(late).rejects.toEqual(
			configError("The connect() the ui was handling has ended"),
		);
		expect(client.sessions.size).toBe(0);
	});
});
