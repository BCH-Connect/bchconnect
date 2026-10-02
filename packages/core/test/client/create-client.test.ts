import type { DemoAltProtocol, DemoProtocol } from "@bchconnect/test-utils";
import { createFakeConnector, demoSession } from "@bchconnect/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "../../src/client/create-client.js";
import type { ClientSnapshot } from "../../src/types/client.js";
import type {
	KeyValueStore,
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

function createStorage(): KeyValueStore {
	return {
		get: vi.fn(async () => undefined),
		set: vi.fn(async () => {}),
		delete: vi.fn(async () => {}),
	};
}

function configError(message: string) {
	return expect.objectContaining({ code: "CONFIG", message });
}

const appMetadata = { name: "Test", url: "https://example.com" };

const snapshot: ClientSnapshot = {
	version: 1,
	currentSessionId: "session-1",
	sessions: [
		{
			id: "session-1",
			protocol: "demo",
			network: "chipnet",
			wallet: { source: "selection", name: "Cashonize" },
		},
	],
};

function createDemoClient() {
	return createClient({
		connectors: [createFakeConnector<DemoProtocol>({ protocol: "demo" })],
		network: "chipnet",
		appMetadata,
	});
}

type DemoClient = ReturnType<typeof createDemoClient>;

describe("createClient", () => {
	it("should list protocol ids in registration order", () => {
		const client = createClient({
			connectors: [
				createFakeConnector<DemoAltProtocol>({ protocol: "demo-alt" }),
				createFakeConnector<DemoProtocol>({ protocol: "demo" }),
			],
			network: "chipnet",
			appMetadata,
		});

		expect(client.protocols).toEqual(["demo-alt", "demo"]);
	});

	it("should accept an empty connector list", () => {
		const client = createClient({
			connectors: [],
			network: "chipnet",
			appMetadata,
		});

		expect(client.protocols).toEqual([]);
	});

	it("should call no connector and touch no storage while constructing", () => {
		const connector = createFakeConnector<DemoProtocol>({ protocol: "demo" });
		const storage = createStorage();

		createClient({
			connectors: [connector],
			network: "chipnet",
			appMetadata,
			storage,
		});

		expect(connector.log).toEqual([]);
		expect(storage.get).not.toHaveBeenCalled();
		expect(storage.set).not.toHaveBeenCalled();
		expect(storage.delete).not.toHaveBeenCalled();
	});

	it("should throw CONFIG for a duplicate protocol id", () => {
		expect(() =>
			createClient({
				connectors: [
					createFakeConnector<DemoProtocol>({ protocol: "demo" }),
					createFakeConnector<DemoProtocol>({ protocol: "demo" }),
				],
				network: "chipnet",
				appMetadata,
			}),
		).toThrow(configError("Duplicate protocol id: demo"));
	});

	it("should throw CONFIG for a protocol id containing ':'", () => {
		expect(() =>
			createClient({
				connectors: [
					createFakeConnector<ProtocolDefinition>({ protocol: "demo:alt" }),
				],
				network: "chipnet",
				appMetadata,
			}),
		).toThrow(configError('Reserved ":" in protocol id: demo:alt'));
	});

	it("should throw CONFIG when the network is missing", () => {
		expect(() =>
			// @ts-expect-error - the network is required.
			createClient({ connectors: [], appMetadata }),
		).toThrow(configError("Missing network"));
	});

	it("should throw CONFIG for an unknown network", () => {
		expect(() =>
			createClient({
				connectors: [],
				// @ts-expect-error - "testnet" is not a network.
				network: "testnet",
				appMetadata,
			}),
		).toThrow(configError("Unknown network: testnet"));
	});

	it("should throw CONFIG for an initial state without ssr", () => {
		expect(() =>
			createClient({
				connectors: [],
				network: "chipnet",
				appMetadata,
				initialState: snapshot,
			}),
		).toThrow(configError("initialState requires ssr: true"));
		expect(() =>
			createClient({
				connectors: [],
				network: "chipnet",
				appMetadata,
				ssr: false,
				initialState: snapshot,
			}),
		).toThrow(configError("initialState requires ssr: true"));
	});

	it("should not check the app metadata at runtime", () => {
		expect(() =>
			createClient({
				connectors: [],
				network: "chipnet",
				// @ts-expect-error - the app metadata needs a name and a url.
				appMetadata: {},
			}),
		).not.toThrow();
	});

	it("should start idle with no sessions", () => {
		const client = createClient({
			connectors: [],
			network: "chipnet",
			appMetadata,
		});

		expect(client.store.getState()).toEqual({
			status: "idle",
			sessions: new Map(),
			currentSessionId: null,
			pendingRequests: new Map(),
			snapshot: null,
		});
	});

	it("should derive status and sessions from the store", () => {
		const client = createClient({
			connectors: [],
			network: "chipnet",
			appMetadata,
		});
		const state = client.store.getState();

		expect(client.status).toBe(state.status);
		expect(client.sessions).toBe(state.sessions);
	});

	it("should expose one store without a way to write to it", () => {
		const client = createClient({
			connectors: [],
			network: "chipnet",
			appMetadata,
		});

		expect(client.store).toBe(client.store);
		expect("setState" in client.store).toBe(false);
	});

	it("should start restoring with the initial state as the snapshot under ssr", () => {
		const client = createClient({
			connectors: [],
			network: "chipnet",
			appMetadata,
			ssr: true,
			initialState: snapshot,
		});

		expect(client.status).toBe("restoring");
		expect(client.store.getState().snapshot).toBe(snapshot);
	});

	it("should start restoring with no snapshot under ssr without an initial state", () => {
		const client = createClient({
			connectors: [],
			network: "chipnet",
			appMetadata,
			ssr: true,
		});

		expect(client.status).toBe("restoring");
		expect(client.store.getState().snapshot).toBeNull();
	});

	it("should discard a malformed initial state with a debug log", () => {
		const logger = createLogger();
		const malformed: ClientSnapshot = {
			...snapshot,
			currentSessionId: "session-2",
		};

		const client = createClient({
			connectors: [],
			network: "chipnet",
			appMetadata,
			ssr: true,
			initialState: malformed,
			logger,
		});

		expect(client.store.getState().snapshot).toBeNull();
		expect(logger.debug).toHaveBeenCalledExactlyOnceWith(
			expect.any(String),
			malformed,
		);
	});

	it("should discard a malformed initial state without a logger", () => {
		const client = createClient({
			connectors: [],
			network: "chipnet",
			appMetadata,
			ssr: true,
			initialState: { ...snapshot, currentSessionId: "session-2" },
		});

		expect(client.store.getState().snapshot).toBeNull();
	});

	describe("members that are not implemented yet", () => {
		const session = demoSession();

		it.each<[string, (client: DemoClient) => Promise<unknown>]>([
			["init", (client) => client.init()],
			["dispose", (client) => client.dispose()],
			["connect", (client) => client.connect("demo")],
			["disconnect", (client) => client.disconnect()],
			[
				"request",
				(client) => client.request(session, "get_addresses", undefined),
			],
		])("should reject %s() with CONFIG", async (method, call) => {
			await expect(call(createDemoClient())).rejects.toThrow(
				configError(`${method}() is not implemented yet`),
			);
		});

		it.each<[string, (client: DemoClient) => unknown]>([
			["setCurrent", (client) => client.setCurrent(null)],
			["on", (client) => client.on("client:error", () => {})],
			["session", (client) => client.session("demo")],
			[
				"subscribe",
				(client) => client.subscribe(session, "wallet_ready", () => {}),
			],
			["capability", (client) => client.capability(session, "message-signing")],
			["can", (client) => client.can(session, "message-signing")],
		])("should throw CONFIG from %s()", (method, call) => {
			expect(() => call(createDemoClient())).toThrow(
				configError(`${method}() is not implemented yet`),
			);
		});
	});
});
