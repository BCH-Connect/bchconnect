import type {
	ProtocolDefinition,
	Session,
	SessionStatus,
	WalletIdentity,
} from "@bchconnect/core";

/**
 * The parts of a {@link @bchconnect/core#Session | Session} a test cares
 * about. Everything else is filled with a plausible default.
 *
 * @beta
 */
export interface FakeSessionInit<P extends ProtocolDefinition> {
	/** Protocol id. Must match the connector the session belongs to. */
	readonly protocol: P["id"];
	/** The protocol's handshake payload. */
	readonly data: P["session"];
	/** Session id. Defaults to a fresh `crypto.randomUUID()`. */
	readonly id?: string;
	/** Wallet identity. Defaults to `{ source: "protocol" }`, with no name. */
	readonly wallet?: WalletIdentity;
	/** Session status. Defaults to connected and reachable. */
	readonly status?: SessionStatus;
}

/**
 * Builds a `Session` for tests.
 *
 * Pass the result to `createFakeConnector` as a value for a session whose id
 * the test pins, or as a function for a fresh id on every `connect()`.
 *
 * @example
 * ```ts
 * const session = fakeSession<DemoProtocol>({
 * 	id: "s1",
 * 	protocol: "demo",
 * 	data: {
 * 		addresses: ["bitcoincash:qpea4gc3r589sdqdcprsu6uyxpugpqnshsa8v7vsxq"],
 * 		xpubs: [],
 * 	},
 * });
 * ```
 *
 * @beta
 */
export function fakeSession<P extends ProtocolDefinition>(
	init: FakeSessionInit<P>,
): Session<P> {
	return {
		id: init.id ?? crypto.randomUUID(),
		protocol: init.protocol,
		wallet: init.wallet ?? { source: "protocol" },
		data: init.data,
		status: init.status ?? { transport: "connected", peer: "reachable" },
	};
}
