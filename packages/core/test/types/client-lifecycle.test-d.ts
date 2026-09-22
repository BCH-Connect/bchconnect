import { describe, expectTypeOf, it } from "vitest";
import type {
	Client,
	ClientLifecycle,
	ClientState,
	ClientStatus,
	ClientStore,
	ConnectOptions,
	LifecycleEvents,
	ProtocolDefinition,
	Session,
} from "../../src/index.js";
import {
	client,
	nineClient,
	type TestCashConnect,
	type TestSession,
	type TestWizard,
} from "./fixtures/client.js";
import type { Wc2 } from "./fixtures/wc2.js";

declare const wc2Client: Client<Wc2>;
declare const wizardClient: Client<TestWizard>;
declare const ccClient: Client<TestCashConnect>;

declare function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
): T;

/** `ClientLifecycle` with `connect` declared as a property instead of a method. */
interface PropertyConnectLifecycle {
	readonly protocols: readonly string[];
	readonly status: ClientStatus;
	readonly sessions: ReadonlyMap<string, Session<ProtocolDefinition>>;
	readonly current: Session<ProtocolDefinition> | null;
	readonly store: ClientStore;
	init(): Promise<void>;
	dispose(): Promise<void>;
	connect: (
		protocol: string,
		opts?: ConnectOptions,
	) => Promise<Session<ProtocolDefinition>>;
	disconnect(session?: Session<ProtocolDefinition>): Promise<void>;
	setCurrent(session: Session<ProtocolDefinition> | null): void;
	on<E extends keyof LifecycleEvents>(
		event: E,
		listener: (payload: LifecycleEvents[E]) => void,
	): () => void;
}

describe("client lifecycle", () => {
	it("should be satisfied by every client", () => {
		expectTypeOf(wc2Client).toExtend<ClientLifecycle>();
		expectTypeOf(wizardClient).toExtend<ClientLifecycle>();
		expectTypeOf(ccClient).toExtend<ClientLifecycle>();
		expectTypeOf(client).toExtend<ClientLifecycle>();
		expectTypeOf(nineClient).toExtend<ClientLifecycle>();
	});

	it("should expose a store usable with useSyncExternalStore", () => {
		expectTypeOf(client.store).toEqualTypeOf<ClientStore>();
		expectTypeOf(
			useSyncExternalStore(client.store.subscribe, client.store.getState),
		).toEqualTypeOf<ClientState>();
	});

	it("should type lifecycle events by the client's protocols", () => {
		client.on("session:connected", ({ session }) => {
			expectTypeOf(session).toEqualTypeOf<TestSession>();
		});
		const lifecycle: ClientLifecycle = client;
		lifecycle.on("session:connected", ({ session }) => {
			expectTypeOf(session).toEqualTypeOf<Session<ProtocolDefinition>>();
		});
	});

	it("should not accept a client as Client<ProtocolDefinition>", () => {
		// @ts-expect-error - Client<P> is invariant in P.
		const loose: Client<ProtocolDefinition> = wc2Client;
		void loose;
	});
});

describe("client lifecycle method syntax", () => {
	it("should reject a client when connect is declared as a property", () => {
		expectTypeOf(wc2Client).not.toExtend<PropertyConnectLifecycle>();
		expectTypeOf(nineClient).not.toExtend<PropertyConnectLifecycle>();
	});

	it("should accept methods and reject properties for every protocol-typed member", () => {
		expectTypeOf(wc2Client).toExtend<{
			connect(protocol: string): Promise<Session<ProtocolDefinition>>;
			disconnect(session?: Session<ProtocolDefinition>): Promise<void>;
			setCurrent(session: Session<ProtocolDefinition> | null): void;
		}>();
		expectTypeOf(wc2Client).not.toExtend<{
			connect: (protocol: string) => Promise<Session<ProtocolDefinition>>;
		}>();
		expectTypeOf(wc2Client).not.toExtend<{
			disconnect: (session?: Session<ProtocolDefinition>) => Promise<void>;
		}>();
		expectTypeOf(wc2Client).not.toExtend<{
			setCurrent: (session: Session<ProtocolDefinition> | null) => void;
		}>();
	});

	it("should keep method bivariance through Pick, Omit, Required and indexed access", () => {
		expectTypeOf(wc2Client).toExtend<Pick<ClientLifecycle, "connect">>();
		expectTypeOf(wc2Client).toExtend<Omit<ClientLifecycle, "store">>();
		expectTypeOf(wc2Client).toExtend<Required<ClientLifecycle>>();
		expectTypeOf(wc2Client).toExtend<{
			connect: ClientLifecycle["connect"];
		}>();
	});
});
