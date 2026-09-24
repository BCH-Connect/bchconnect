import type {
	ConnectorContext,
	ConnectorEventName,
	KeyValueStore,
	LifecycleEvents,
} from "@bchconnect/core";

/** An in-memory `KeyValueStore` whose contents the test can inspect. */
export function memoryStore(): KeyValueStore & {
	entries: Map<string, string>;
} {
	const entries = new Map<string, string>();
	return {
		entries,
		get: (key) => Promise.resolve(entries.get(key)),
		set: (key, value) => {
			entries.set(key, value);
			return Promise.resolve();
		},
		delete: (key) => {
			entries.delete(key);
			return Promise.resolve();
		},
	};
}

/** One event a connector emitted through its context. */
export interface EmittedEvent {
	event: ConnectorEventName;
	payload: LifecycleEvents[ConnectorEventName];
}

/** A `ConnectorContext` that records what the connector emits. */
export function fakeContext(): ConnectorContext & {
	storage: ReturnType<typeof memoryStore>;
	emitted: EmittedEvent[];
} {
	const storage = memoryStore();
	const emitted: EmittedEvent[] = [];
	return {
		storage,
		emitted,
		network: "chipnet",
		appMetadata: { name: "Test dapp", url: "https://example.test" },
		logger: {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		},
		emit(event, payload) {
			emitted.push({ event, payload });
		},
	};
}
