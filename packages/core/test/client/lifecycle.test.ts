import type { DemoAltProtocol, DemoProtocol } from "@bchconnect/test-utils";
import { createFakeConnector, demoSession } from "@bchconnect/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import { TransportError } from "../../src/errors.js";
import type { ClientStatus, LifecycleEvents } from "../../src/types/client.js";
import type {
	Connector,
	ConnectorContext,
	Logger,
	ProtocolDefinition,
} from "../../src/types/protocol.js";

function createLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

const appMetadata = { name: "Test", url: "https://example.com" };

function setupClient(
	connectors: readonly Connector[],
	options: { ssr?: boolean; logger?: Logger } = {},
) {
	const client = createClient({
		connectors,
		network: "chipnet",
		appMetadata,
		...options,
	});
	const errors: LifecycleEvents["client:error"][] = [];
	client.on("client:error", (payload) => errors.push(payload));

	return { client, errors };
}

describe("init", () => {
	it("should set up every connector in registration order", async () => {
		const first = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const second = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
		});
		const setupFirst = vi.spyOn(first, "setup");
		const setupSecond = vi.spyOn(second, "setup");
		const { client } = setupClient([first, second]);

		await client.init();

		expect(setupFirst).toHaveBeenCalledOnce();
		expect(setupSecond).toHaveBeenCalledOnce();
		expect(setupFirst).toHaveBeenCalledBefore(setupSecond);
	});

	it("should wait for one connector's setup before starting the next", async () => {
		let finishSetup = (): void => {};
		const setupDone = new Promise<void>((resolve) => {
			finishSetup = resolve;
		});
		const first = {
			...createFakeConnector<DemoProtocol>({ protocol: "demo" }),
			setup: () => setupDone,
		};
		const second = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
		});
		const { client } = setupClient([first, second]);

		const initialized = client.init();
		await Promise.resolve();

		expect(second.log).toEqual([]);

		finishSetup();
		await initialized;

		expect(second.log).toEqual([{ kind: "setup" }]);
	});

	it("should return the same promise from every call", async () => {
		const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const { client } = setupClient([connector]);

		const first = client.init();
		const second = client.init();
		await first;

		expect(second).toBe(first);
		expect(client.init()).toBe(first);
		expect(connector.log).toEqual([{ kind: "setup" }]);
	});

	it("should move from idle through restoring to ready", async () => {
		const { client } = setupClient([
			createFakeConnector<DemoProtocol>({ protocol: "demo" }),
		]);
		const statuses: ClientStatus[] = [];
		client.store.subscribe(() => statuses.push(client.status));

		await client.init();

		expect(statuses).toEqual(["restoring", "ready"]);
	});

	it("should go from restoring straight to ready under ssr", async () => {
		const { client } = setupClient(
			[createFakeConnector<DemoProtocol>({ protocol: "demo" })],
			{ ssr: true },
		);
		const statuses: ClientStatus[] = [];
		client.store.subscribe(() => statuses.push(client.status));

		await client.init();

		expect(statuses).toEqual(["ready"]);
	});

	it("should become ready with no connectors", async () => {
		const { client } = setupClient([]);

		await client.init();

		expect(client.status).toBe("ready");
	});

	it("should report a failed setup as a CONFIG client error", async () => {
		const connector = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			setup: "throw",
		});
		const { client, errors } = setupClient([connector]);

		await client.init();

		expect(errors).toEqual([
			{
				error: expect.objectContaining({
					code: "CONFIG",
					message: 'Connector "demo" failed setup',
					cause: expect.objectContaining({
						message: 'Fake connector "demo" failed setup.',
					}),
				}),
			},
		]);
	});

	it("should report a library error thrown by setup unchanged", async () => {
		const failure = new TransportError("Relay unreachable");
		const connector = {
			...createFakeConnector<DemoProtocol>({ protocol: "demo" }),
			setup: () => Promise.reject(failure),
		};
		const { client, errors } = setupClient([connector]);

		await client.init();

		expect(errors).toEqual([{ error: failure }]);
	});

	it("should keep setting up the other connectors after a failed setup", async () => {
		const failing = createFakeConnector<DemoProtocol>({
			protocol: "demo",
			setup: "throw",
		});
		const healthy = createFakeConnector<DemoAltProtocol>({
			protocol: "demo-alt",
		});
		const { client } = setupClient([failing, healthy]);

		await client.init();

		expect(healthy.log).toEqual([{ kind: "setup" }]);
		expect(client.status).toBe("ready");
	});

	it("should stop reporting client errors to a listener that unsubscribed", async () => {
		const client = createClient({
			connectors: [
				createFakeConnector<DemoProtocol>({ protocol: "demo", setup: "throw" }),
			],
			network: "chipnet",
			appMetadata,
		});
		const listener = vi.fn();
		const off = client.on("client:error", listener);

		off();
		await client.init();

		expect(listener).not.toHaveBeenCalled();
	});

	describe("connector context", () => {
		function captureContexts(protocols: readonly string[]) {
			const contexts = new Map<string, ConnectorContext>();
			const connectors = protocols.map((protocol) => ({
				...createFakeConnector<ProtocolDefinition>({ protocol }),
				setup(ctx: ConnectorContext) {
					contexts.set(protocol, ctx);
				},
			}));

			function contextOf(protocol: string) {
				const context = contexts.get(protocol);
				if (context === undefined) {
					throw new Error(`"${protocol}" was never set up`);
				}
				return context;
			}

			return { connectors, contextOf };
		}

		it("should hand each connector the client's network, app metadata and logger", async () => {
			const logger = createLogger();
			const { connectors, contextOf } = captureContexts(["demo"]);
			const { client } = setupClient(connectors, { logger });

			await client.init();

			expect(contextOf("demo")).toMatchObject({
				network: "chipnet",
				appMetadata,
				logger,
			});
		});

		it("should give each connector storage that no other connector sees", async () => {
			const { connectors, contextOf } = captureContexts(["demo", "demo-alt"]);
			const { client } = setupClient(connectors);
			await client.init();

			await contextOf("demo").storage.set("credentials", "secret");

			await expect(contextOf("demo").storage.get("credentials")).resolves.toBe(
				"secret",
			);
			await expect(
				contextOf("demo-alt").storage.get("credentials"),
			).resolves.toBeUndefined();
		});

		it("should never write connector storage to the client's storage", async () => {
			const storage = {
				get: vi.fn(async () => undefined),
				set: vi.fn(async () => {}),
				delete: vi.fn(async () => {}),
			};
			const { connectors, contextOf } = captureContexts(["demo"]);
			const client = createClient({
				connectors,
				network: "chipnet",
				appMetadata,
				storage,
			});
			await client.init();

			await contextOf("demo").storage.set("credentials", "secret");

			expect(storage.set).not.toHaveBeenCalled();
		});

		it("should not turn a connector's session events into client events or state", async () => {
			const connector = createFakeConnector<DemoProtocol>({
				protocol: "demo",
			});
			const { client } = setupClient([connector]);
			const connected = vi.fn();
			client.on("session:connected", connected);
			await client.init();
			const state = client.store.getState();

			connector.emit("session:connected", { session: demoSession() });

			expect(connected).not.toHaveBeenCalled();
			expect(client.store.getState()).toBe(state);
		});
	});
});
