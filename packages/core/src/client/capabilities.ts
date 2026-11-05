import { SessionMissingError } from "../errors.js";
import type {
	CapabilityMap,
	CapabilityRegistry,
} from "../types/capabilities.js";
import type {
	Connector,
	ProtocolDefinition,
	Session,
} from "../types/protocol.js";
import type { Requests } from "./requests.js";
import type { ClientRuntime } from "./runtime.js";

/**
 * The client's capability lookups, as `ClientLifecycle.capability` and
 * `ClientLifecycle.can` with every protocol-typed parameter loosened.
 *
 * @internal
 */
export interface Capabilities {
	/** The session's interface for `name`, or `null` when it has none. */
	capability<N extends keyof CapabilityRegistry>(
		session: Session,
		name: N,
	): CapabilityRegistry[N] | null;
	/** Whether the session has the capability `name`. */
	can(session: Session, name: string): boolean;
}

/**
 * Creates the {@link Capabilities} of one client.
 *
 * @example
 * ```ts
 * const capabilities = createCapabilities(runtime, requests);
 * const signing = capabilities.capability(session, "libauth-signing");
 * ```
 *
 * @internal
 */
export function createCapabilities(
	runtime: ClientRuntime,
	requests: Requests,
): Capabilities {
	const { store } = runtime;
	// Keyed by the session object in state, so a changed session builds anew and a removed one is collected.
	const built = new WeakMap<Session, CapabilityMap<ProtocolDefinition>>();

	// We get it from the store because the passed session could be an older snapshot.
	function resolve(passedSession: Session): [Session, Connector] {
		const sessionId = passedSession.id;
		const session = store.getState().sessions.get(sessionId);
		const connector = session
			? runtime.connectors.get(session.protocol)
			: undefined;
		if (session === undefined || connector === undefined) {
			throw new SessionMissingError(
				`Session "${sessionId}" is not currently connected`,
				{ sessionId },
			);
		}
		return [session, connector];
	}

	return {
		can(passedSession, name) {
			const [session, connector] = resolve(passedSession);
			return connector.capabilitiesOf(session).has(name);
		},
		capability(passedSession, name) {
			const [session, connector] = resolve(passedSession);
			if (!connector.capabilitiesOf(session).has(name)) return null;

			let interfaces = built.get(session);
			if (interfaces === undefined) {
				interfaces =
					connector.capabilities?.(session, {
						request: (method, params, opts) =>
							requests.request(session, method, params, opts),
					}) ?? {};
				built.set(session, interfaces);
			}
			return interfaces[name] ?? null;
		},
	};
}
