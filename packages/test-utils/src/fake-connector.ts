import {
	AbortedError,
	type Connector,
	type ConnectorContext,
	type EventName,
	type EventPayload,
	InvalidWalletResponseError,
	type MethodName,
	type MethodParams,
	type MethodResult,
	MethodUnsupportedError,
	type Pairing,
	type ProtocolDefinition,
	type RequestOptions,
	RequestRejectedError,
	type Session,
} from "@bchconnect/core";

/**
 * What a scripted method does when the client dispatches it: a handler, or one
 * of the canned outcomes.
 *
 * `"reject"` rejects `REJECTED` by the user, `"malformed"` rejects
 * `INVALID_WALLET_RESPONSE` the way a connector does when validation of the
 * wallet's reply fails, and `"hang"` never settles on its own — the call shows
 * up in {@link FakeConnectorHandle.pending} for the test to settle, and aborts
 * with `ABORTED` when its signal does.
 *
 * @beta
 */
export type FakeMethodScript<
	P extends ProtocolDefinition,
	M extends MethodName<P>,
> =
	| ((
			params: MethodParams<P, M>,
			opts: RequestOptions | undefined,
	  ) => Promise<MethodResult<P, M>>)
	| "reject"
	| "hang"
	| "malformed";

/**
 * Scripted methods, by name. A method left out rejects
 * `METHOD_UNSUPPORTED`, the way a connector reports a method the session does
 * not advertise.
 *
 * @beta
 */
export type FakeMethodScripts<P extends ProtocolDefinition> = {
	readonly [M in MethodName<P>]?: FakeMethodScript<P, M>;
};

/**
 * What a {@link createFakeConnector} connector does, from `setup()` to
 * `dispose()`.
 *
 * @beta
 */
export interface FakeConnectorScript<P extends ProtocolDefinition> {
	/** Protocol id. Must equal `P["id"]`. */
	readonly protocol: P["id"];
	/**
	 * The session `connect()` resolves with. A value is returned as written on
	 * every call; a function is called once per `connect()`, so
	 * `() => fakeSession(…)` gives a fresh id each time.
	 */
	readonly session?: Session<P> | (() => Session<P>);
	/** Pairing material handed to `onPairing` at the start of `connect()`. */
	readonly pairing?: Pairing;
	/** How `connect()` behaves. Resolves with the scripted session by default. */
	readonly connect?:
		| "reject"
		| "hang"
		| ((opts: {
				signal?: AbortSignal;
				onPairing?: (pairing: Pairing) => void;
				timeoutMs?: number;
		  }) => Promise<Session<P>>);
	/** What `restore()` returns, or `"throw"` to fail it. Defaults to `[]`. */
	readonly restore?:
		| readonly Session<P>[]
		| (() => Promise<readonly Session<P>[]>)
		| "throw";
	/** `"throw"` makes `setup()` fail, to exercise connector isolation. */
	readonly setup?: "throw";
	/** `"throw"` makes `disconnect()` fail, after its local cleanup ran. */
	readonly disconnect?: "throw";
	/** `"throw"` makes `dispose()` fail. */
	readonly dispose?: "throw";
	/** Scripted methods. */
	readonly methods?: FakeMethodScripts<P>;
	/** Capabilities of every session, or of one session. Defaults to none. */
	readonly capabilities?:
		| readonly P["capability"][]
		| ((session: Session<P>) => readonly P["capability"][]);
	/**
	 * Whether `connect()` writes a marker to its storage namespace and
	 * `disconnect()` removes it. On by default; `setup()` never writes.
	 */
	readonly persist?: boolean;
}

/**
 * One recorded `request()` call.
 *
 * @beta
 */
export interface FakeRequestCall<P extends ProtocolDefinition> {
	/** The session the request was dispatched on. */
	readonly sessionId: string;
	/** Method name. */
	readonly method: MethodName<P>;
	/** Params, as the client passed them. */
	readonly params: unknown;
	/** Options, as the client passed them. */
	readonly opts: RequestOptions | undefined;
	/** The combined signal the client built, when there was one. */
	readonly signal: AbortSignal | undefined;
}

/**
 * One recorded call of any kind, in call order.
 *
 * @beta
 */
export type FakeLogEntry<P extends ProtocolDefinition> =
	| { readonly kind: "setup" }
	| { readonly kind: "connect"; readonly timeoutMs: number | undefined }
	| { readonly kind: "restore" }
	| { readonly kind: "disconnect"; readonly sessionId: string }
	| {
			readonly kind: "request";
			readonly sessionId: string;
			readonly method: MethodName<P>;
	  }
	| {
			readonly kind: "subscribe";
			readonly sessionId: string;
			readonly event: EventName<P>;
	  }
	| {
			readonly kind: "unsubscribe";
			readonly sessionId: string;
			readonly event: EventName<P>;
	  }
	| { readonly kind: "dispose" };

/**
 * A `"hang"` call the test can settle whenever it likes.
 *
 * @beta
 */
export interface FakePendingRequest<P extends ProtocolDefinition> {
	/** The session the request was dispatched on. */
	readonly sessionId: string;
	/** Method name. */
	readonly method: MethodName<P>;
	/** Params, as the client passed them. */
	readonly params: unknown;
	/** The combined signal the client built, when there was one. */
	readonly signal: AbortSignal | undefined;
	/** Settles the call with a result. A second settlement does nothing. */
	resolve(result: unknown): void;
	/** Settles the call with an error. A second settlement does nothing. */
	reject(error: unknown): void;
}

/**
 * What a fake connector exposes on top of
 * {@link @bchconnect/core#Connector | Connector}.
 *
 * @beta
 */
export interface FakeConnectorHandle<P extends ProtocolDefinition> {
	/** Every `request()` call, in order. */
	readonly calls: readonly FakeRequestCall<P>[];
	/** Every call of any kind, in order. */
	readonly log: readonly FakeLogEntry<P>[];
	/** Unsettled `"hang"` calls, in dispatch order. */
	readonly pending: readonly FakePendingRequest<P>[];
	/** Emits a session lifecycle event. Throws before `setup()` ran. */
	emit: ConnectorContext["emit"];
	/** Delivers a protocol event to the listeners of one session. */
	emitProtocolEvent<E extends EventName<P>>(
		session: Session<P>,
		event: E,
		payload: EventPayload<P, E>,
	): void;
}

/**
 * A connector whose every outcome is scripted, plus its recordings.
 *
 * @beta
 */
export type FakeConnector<P extends ProtocolDefinition> = Connector<P> &
	FakeConnectorHandle<P>;

/** Key under which `connect()` records a session in its storage namespace. */
function storageKey(sessionId: string): string {
	return `session:${sessionId}`;
}

/** Key under which one session's listeners for one event are held. */
function listenerKey(sessionId: string, event: string): string {
	return `${sessionId}::${event}`;
}

/**
 * Builds a connector that does exactly what its script says, and records
 * everything the client asked of it.
 *
 * The protocol is passed explicitly: a partial method map and an optional
 * session give inference nothing reliable to work from.
 *
 * @example
 * ```ts
 * const connector = createFakeConnector<DemoProtocol>({
 * 	protocol: "demo",
 * 	session: demoSession({ id: "s1" }),
 * 	methods: {
 * 		get_balance: async () => ({ sats: 1_000n }),
 * 		sign_message: "hang",
 * 	},
 * 	capabilities: ["message-signing"],
 * });
 *
 * const session = await connector.connect({});
 * connector.emitProtocolEvent(session, "wallet_ready", { walletName: "Fake" });
 * ```
 *
 * @beta
 */
export function createFakeConnector<P extends ProtocolDefinition>(
	script: FakeConnectorScript<P>,
): FakeConnector<P> {
	const calls: FakeRequestCall<P>[] = [];
	const log: FakeLogEntry<P>[] = [];
	const pending: FakePendingRequest<P>[] = [];
	const listeners = new Map<string, Set<(payload: never) => void>>();
	const persist = script.persist ?? true;
	let context: ConnectorContext | undefined;

	const nextSession = (): Session<P> => {
		if (script.session === undefined) {
			throw new Error(
				`Fake connector "${script.protocol}" has no session to connect with.`,
			);
		}
		return typeof script.session === "function"
			? script.session()
			: script.session;
	};

	const abortedError = (signal: AbortSignal): AbortedError =>
		new AbortedError("Aborted by caller", { cause: signal.reason });

	/** Never settles on its own; rejects when `signal` aborts. */
	const hang = <T>(
		signal: AbortSignal | undefined,
		onSettle?: () => void,
	): {
		promise: Promise<T>;
		resolve: (value: unknown) => void;
		reject: (error: unknown) => void;
	} => {
		let settle: ((value: unknown) => void) | undefined;
		let fail: ((error: unknown) => void) | undefined;
		const promise = new Promise<T>((resolvePromise, rejectPromise) => {
			// The scripted value stands in for a wallet reply, which the client
			// treats as opaque until a connector validates it.
			settle = (value) => resolvePromise(value as T);
			fail = rejectPromise;
		});

		const done = (): void => {
			signal?.removeEventListener("abort", onAbort);
			onSettle?.();
		};
		const onAbort = (): void => {
			if (signal !== undefined) fail?.(abortedError(signal));
			done();
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		return {
			promise,
			resolve: (value) => {
				settle?.(value);
				done();
			},
			reject: (error) => {
				fail?.(error);
				done();
			},
		};
	};

	const connector: FakeConnector<P> = {
		protocol: script.protocol,
		calls,
		log,
		pending,

		emit(event, payload) {
			if (context === undefined) {
				throw new Error(
					`Fake connector "${script.protocol}" cannot emit before setup().`,
				);
			}
			context.emit(event, payload);
		},

		emitProtocolEvent(session, event, payload) {
			const registered = listeners.get(listenerKey(session.id, event));
			if (registered === undefined) return;
			for (const listener of [...registered]) listener(payload as never);
		},

		setup(ctx) {
			log.push({ kind: "setup" });
			if (script.setup === "throw") {
				throw new Error(`Fake connector "${script.protocol}" failed setup.`);
			}
			context = ctx;
		},

		async connect(opts) {
			log.push({ kind: "connect", timeoutMs: opts.timeoutMs });
			if (opts.signal?.aborted === true) throw abortedError(opts.signal);
			if (script.pairing !== undefined) opts.onPairing?.(script.pairing);

			if (script.connect === "reject") {
				throw new RequestRejectedError("Connection rejected", { by: "user" });
			}

			const session =
				script.connect === "hang"
					? await hang<Session<P>>(opts.signal).promise
					: typeof script.connect === "function"
						? await script.connect(opts)
						: nextSession();

			if (persist) await context?.storage.set(storageKey(session.id), "1");
			return session;
		},

		async restore() {
			log.push({ kind: "restore" });
			if (script.restore === "throw") {
				throw new Error(`Fake connector "${script.protocol}" failed restore.`);
			}
			if (typeof script.restore === "function")
				return [...(await script.restore())];
			return [...(script.restore ?? [])];
		},

		async disconnect(session) {
			log.push({ kind: "disconnect", sessionId: session.id });
			if (persist) await context?.storage.delete(storageKey(session.id));
			if (script.disconnect === "throw") {
				throw new Error(
					`Fake connector "${script.protocol}" failed to disconnect.`,
				);
			}
		},

		request(session, method, params, opts) {
			calls.push({
				sessionId: session.id,
				method,
				params,
				opts,
				signal: opts?.signal,
			});
			log.push({ kind: "request", sessionId: session.id, method });

			const handler = script.methods?.[method];
			if (handler === undefined) {
				return Promise.reject(
					new MethodUnsupportedError(`Method "${method}" is not advertised`, {
						sessionId: session.id,
					}),
				);
			}
			if (opts?.signal?.aborted === true) {
				return Promise.reject(abortedError(opts.signal));
			}
			if (handler === "reject") {
				return Promise.reject(
					new RequestRejectedError(`Request "${method}" rejected`, {
						by: "user",
						sessionId: session.id,
					}),
				);
			}
			if (handler === "malformed") {
				return Promise.reject(
					new InvalidWalletResponseError(
						`Wallet returned a malformed result for "${method}"`,
						{ sessionId: session.id },
					),
				);
			}
			if (handler === "hang") {
				const held = hang<MethodResult<P, typeof method>>(opts?.signal, () => {
					const index = pending.indexOf(entry);
					if (index !== -1) pending.splice(index, 1);
				});
				const entry: FakePendingRequest<P> = {
					sessionId: session.id,
					method,
					params,
					signal: opts?.signal,
					resolve: held.resolve,
					reject: held.reject,
				};
				pending.push(entry);
				return held.promise;
			}
			return handler(params, opts);
		},

		subscribe(session, event, listener) {
			const key = listenerKey(session.id, event);
			log.push({ kind: "subscribe", sessionId: session.id, event });

			const registered =
				listeners.get(key) ?? new Set<(payload: never) => void>();
			registered.add(listener as (payload: never) => void);
			listeners.set(key, registered);

			let unsubscribed = false;
			return () => {
				if (unsubscribed) return;
				unsubscribed = true;
				log.push({ kind: "unsubscribe", sessionId: session.id, event });
				registered.delete(listener as (payload: never) => void);
				if (registered.size === 0) listeners.delete(key);
			};
		},

		capabilitiesOf(session) {
			const capabilities =
				typeof script.capabilities === "function"
					? script.capabilities(session)
					: (script.capabilities ?? []);
			return new Set(capabilities);
		},

		async dispose() {
			log.push({ kind: "dispose" });
			if (script.dispose === "throw") {
				throw new Error(`Fake connector "${script.protocol}" failed dispose.`);
			}
		},
	};

	return connector;
}
