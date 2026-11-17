import {
	AbortedError,
	type BchConnectError,
	ConfigError,
	type Connector,
	type ConnectorContext,
	InvalidWalletResponseError,
	isBchConnectError,
	type Logger,
	type MethodName,
	type MethodResult,
	MethodUnsupportedError,
	type RequestOptions,
	type Session,
	SessionMissingError,
	type SessionStatus,
	type TransactionOutput,
} from "@bchconnect/core";
import { chains } from "./chains.js";
import { fromWireReturns, toWireParams } from "./codec.js";
import {
	toLoadError,
	toPairingError,
	toRequestError,
	toStartError,
	toTemplateError,
} from "./errors.js";
import {
	isBalanceChanges,
	isBalances,
	isTransaction,
	isTransactionOutput,
} from "./guards.js";
import {
	loadSdk,
	type Sdk,
	type SdkDapp,
	type SdkDappEvents,
	type SdkDappSession,
	type SdkLogger,
	type SdkNostrClient,
	type SdkRequestOptions,
} from "./sdk.js";
import {
	createSessionRecords,
	type SessionRecords,
	type SlotStore,
	toTemplateHash,
} from "./store.js";
import type {
	CashConnectExecuteActionResult,
	CashConnectTemplate,
} from "./template.js";
import type {
	CashConnect,
	CashConnectBalances,
	CashConnectConfig,
} from "./types.js";

const METHODS = ["getBalances", "getTokens", "executeAction"] as const;
const CATEGORY = /^[0-9a-f]{64}$/;
// The SDK keeps a request on the relay for as long as it waits for the
// answer. A request without a deadline gets seven days.
const NO_DEADLINE_MS = 604_800_000;
const DISCONNECTED = "Disconnected by the dapp";
const PAIRING_CANCELLED = "Pairing cancelled by the dapp";
const TEMPLATE_CHANGED = "The dapp's template changed";

type Listener = (payload: { readonly balances: CashConnectBalances }) => void;

/** One SDK `Dapp` with what the connector keeps about it. */
interface Instance<T extends CashConnectTemplate> {
	readonly sdk: Sdk;
	readonly slot: string;
	readonly store: SlotStore;
	readonly dapp: SdkDapp;
	readonly listeners: Set<Listener>;
	/** The relay client, once `start()` has applied the connection policy. */
	client: SdkNostrClient | undefined;
	/** Settles when a `start()` in flight does; `undefined` otherwise. */
	starting: Promise<void> | undefined;
	/** The wallet the SDK reports as paired. */
	paired: SdkDappSession | undefined;
	/** The session's current snapshot, while it is live. */
	session: Session<CashConnect<T>> | undefined;
	/** Removes the connector's listeners from the `Dapp`. */
	release(): void;
}

/** What `setup()` leaves: the client's context and the one set of records. */
interface Setup {
	readonly context: ConnectorContext;
	readonly records: SessionRecords;
}

type Resumed<T extends CashConnectTemplate> =
	| { readonly instance: Instance<T> }
	| { readonly reason: unknown };

function toAbortError(signal: AbortSignal): BchConnectError {
	const { reason } = signal;
	return isBchConnectError(reason)
		? reason
		: new AbortedError("Aborted by caller", { cause: reason });
}

/** Settles like `promise`, or rejects with the abort reason as soon as `signal` aborts. */
function withAbort<T>(
	promise: Promise<T>,
	signal: AbortSignal | undefined,
): Promise<T> {
	if (signal === undefined) return promise;
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(toAbortError(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		promise
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", onAbort));
		if (signal.aborted) onAbort();
	});
}

function isMethod(method: string): method is (typeof METHODS)[number] {
	return METHODS.some((known) => known === method);
}

/** The SDK's logger over the client's: its extra `log` level is debug. */
function toSdkLogger(logger: Logger): SdkLogger {
	const forward =
		(level: keyof Logger) =>
		(...args: unknown[]): void => {
			const [message, ...data] = args;
			logger[level](String(message), ...data);
		};
	return {
		log: forward("debug"),
		debug: forward("debug"),
		info: forward("info"),
		warn: forward("warn"),
		error: forward("error"),
	};
}

/**
 * Creates the connector for the CashConnect protocol. The CashConnect SDK is
 * loaded only when a connection is made or a recorded session is restored.
 *
 * CashConnect is an alpha protocol: its author states it is not yet safe for
 * production and recommends chipnet until its 1.0 release. Wallets that speak
 * it today: Cashonize.
 *
 * The wallet derives the account it uses for this dapp from
 * `appMetadata.url`. Keep that URL the exact same string across releases and
 * environments: a different string is a different account in the wallet. Any
 * dapp can claim any URL.
 *
 * The wallet signs transactions and never broadcasts them; broadcast
 * `data.tx` or `transactions` yourself.
 *
 * @param config - The template whose actions the wallet runs and, optionally,
 * the token categories the dapp asks for.
 * @returns A connector to pass to `createClient`.
 *
 * @example
 * ```ts
 * import { createClient } from "@bchconnect/core";
 * import { cashConnect, sendTemplate } from "@bchconnect/connector-cashconnect";
 *
 * const client = createClient({
 *   connectors: [cashConnect({ template: sendTemplate })],
 *   network: "chipnet",
 *   appMetadata: { name: "My dapp", url: "https://dapp.example" },
 * });
 * ```
 *
 * @beta
 */
export function cashConnect<const T extends CashConnectTemplate>(
	config: CashConnectConfig<T>,
): Connector<CashConnect<T>> {
	let setup: Setup | undefined;
	let disposed = false;
	// Every instance that has not been stopped: live, pairing, or being ended.
	const instances = new Set<Instance<T>>();
	// The instances whose session this connector handed out and has not ended.
	const live = new Map<string, Instance<T>>();
	// The sessions the wallet ended, which the client may not have heard of.
	const endedByWallet = new Set<string>();

	function getSetup(): Setup {
		if (setup === undefined) {
			throw new ConfigError("The CashConnect connector was not set up");
		}
		return setup;
	}

	function createDisposedError(): AbortedError {
		return new AbortedError("The CashConnect connector was disposed");
	}

	function setStatus(
		instance: Instance<T>,
		change: Partial<SessionStatus>,
	): void {
		const previous = instance.session;
		if (previous === undefined) return;
		const status = { ...previous.status, ...change };
		if (
			status.transport === previous.status.transport &&
			status.peer === previous.status.peer
		) {
			return;
		}
		const session = { ...previous, status };
		instance.session = session;
		getSetup().context.emit("session:changed", { session, previous });
	}

	async function halt(dapp: SdkDapp): Promise<void> {
		try {
			await dapp.stop();
		} catch (error) {
			getSetup().context.logger.warn(
				"Stopping the CashConnect connection failed",
				error,
			);
		}
	}

	async function stop(instance: Instance<T>): Promise<void> {
		instance.release();
		instances.delete(instance);
		// A start still in flight can open the socket after this stop, so the
		// instance is stopped again once that start settles.
		void instance.starting?.then(() => halt(instance.dapp));
		await halt(instance.dapp);
	}

	/** Ends the session in the SDK, which tells the wallet. Never rejects. */
	async function forget(instance: Instance<T>, reason: string): Promise<void> {
		try {
			await instance.dapp.forgetSession(reason);
		} catch (error) {
			getSetup().context.logger.warn(
				"Ending the CashConnect session failed",
				error,
			);
		}
	}

	function createInstance(sdk: Sdk, slot: string): Instance<T> {
		const { network, appMetadata, logger } = getSetup().context;
		const { name, url, icon, description } = appMetadata;
		const chain = chains[network];
		const store = getSetup().records.open(slot, {
			chain,
			template: toTemplateHash(sdk.Hasher, config.template),
		});

		function onEstablished({
			session,
		}: SdkDappEvents["sessionEstablished"]): void {
			instance.paired = session;
		}

		// Acted on only for a live session: the SDK also reports the end this
		// connector asked for, and a delete the relay replays.
		function onDeleted(): void {
			const sessionId = instance.session?.id;
			if (sessionId === undefined) return;
			instance.session = undefined;
			live.delete(sessionId);
			endedByWallet.add(sessionId);
			void instance.store.close();
			getSetup().context.emit("session:disconnected", {
				sessionId,
				reason: "wallet",
			});
			void stop(instance);
		}

		// The SDK calls its listeners synchronously, inside its own handlers: a
		// throw here would become the SDK's failure.
		function onBalances(balances: SdkDappEvents["balancesChanged"]): void {
			if (!isBalances(balances)) {
				logger.warn("Ignoring malformed CashConnect balances");
				return;
			}
			for (const listener of [...instance.listeners]) {
				try {
					listener({ balances });
				} catch (error) {
					logger.warn("A CashConnect event listener threw", error);
				}
			}
		}

		// The SDK reports transitions only. With the socket down nothing is
		// known about the wallet.
		function onReachability(reachable: boolean): void {
			const connected = reachable || instance.client?.isConnected() === true;
			setStatus(instance, {
				transport: connected ? "connected" : "reconnecting",
				peer: reachable ? "reachable" : connected ? "unreachable" : "unknown",
			});
		}

		const instance: Instance<T> = {
			sdk,
			slot,
			store,
			// The SDK writes into the options it is given, so they are built here.
			dapp: new sdk.Dapp({
				info: {
					name,
					url,
					...(icon === undefined ? {} : { icon }),
					...(description === undefined ? {} : { description }),
				},
				chain,
				template: config.template,
				allowedTokens: [...(config.allowedTokens ?? [])],
				store,
				sessionKey: slot,
				// Replaces the SDK's default policy, so its heartbeat is run here.
				connectionPolicy: (client) => {
					instance.client = client;
					client.onConnected(() =>
						setStatus(instance, { transport: "connected" }),
					);
					return sdk.NostrClient.SmartHeartbeat()(client);
				},
				logger: toSdkLogger(logger),
			}),
			listeners: new Set(),
			client: undefined,
			starting: undefined,
			paired: undefined,
			session: undefined,
			release() {
				instance.dapp.off("sessionEstablished", onEstablished);
				instance.dapp.off("sessionDeleted", onDeleted);
				instance.dapp.off("balancesChanged", onBalances);
				instance.dapp.off("walletReachabilityChanged", onReachability);
				instance.listeners.clear();
			},
		};
		// Before `start()`: the SDK reports a restored session, and a stored
		// delete, while it starts.
		instance.dapp.on("sessionEstablished", onEstablished);
		instance.dapp.on("sessionDeleted", onDeleted);
		instance.dapp.on("balancesChanged", onBalances);
		instance.dapp.on("walletReachabilityChanged", onReachability);
		instances.add(instance);
		return instance;
	}

	/** Starts the instance, which the SDK allows once. */
	function start(instance: Instance<T>): Promise<void> {
		const started = instance.dapp.start();
		const settle = () => {
			instance.starting = undefined;
		};
		instance.starting = started.then(settle, settle);
		return started;
	}

	function establish(
		instance: Instance<T>,
		paired: SdkDappSession,
	): Session<CashConnect<T>> {
		const connected = instance.client?.isConnected() === true;
		const session: Session<CashConnect<T>> = {
			id: paired.walletPubkey,
			protocol: "cashconnect",
			wallet: { source: "selection" },
			data: {
				walletPubkey: paired.walletPubkey,
				chain: chains[getSetup().context.network],
				template: config.template,
				allowedTokens: [...paired.allowedTokens],
			},
			status: {
				transport: connected ? "connected" : "reconnecting",
				peer:
					connected && instance.dapp.isWalletReachable()
						? "reachable"
						: "unknown",
			},
		};
		instance.session = session;
		live.set(session.id, instance);
		return session;
	}

	/**
	 * Gives up on a pairing, in the background. The protocol cannot cancel
	 * one, so a session the wallet created in the meantime is ended and the
	 * record the SDK wrote for it erased. Once disposed it sends nothing.
	 */
	async function abandon(instance: Instance<T>): Promise<void> {
		if (disposed) return;
		if (instance.dapp.isSessionActive()) {
			await forget(instance, PAIRING_CANCELLED);
		}
		await stop(instance);
		await getSetup().records.erase(instance.slot);
	}

	async function resume(sdk: Sdk, slot: string): Promise<Resumed<T>> {
		const instance = createInstance(sdk, slot);
		try {
			await start(instance);
		} catch (reason) {
			await stop(instance);
			return { reason };
		}
		// Disposing stopped the instance already.
		if (disposed) return { instance };
		if (instance.paired === undefined) await stop(instance);
		else establish(instance, instance.paired);
		return { instance };
	}

	/**
	 * Ends a session that was paired with another template: the wallet runs
	 * the template it received at pairing, so the session cannot be used. A
	 * relay that cannot be reached leaves the record for the next load, so the
	 * wallet is still told.
	 */
	async function endStale(sdk: Sdk, slot: string): Promise<void> {
		const instance = createInstance(sdk, slot);
		try {
			// The SDK reads the record while it starts, so it is erased afterwards.
			await start(instance);
		} catch (error) {
			getSetup().context.logger.warn(
				"Ending the CashConnect session failed",
				error,
			);
			await stop(instance);
			return;
		}
		if (disposed) return;
		await forget(instance, TEMPLATE_CHANGED);
		await stop(instance);
		await instance.store.close();
	}

	/** Tells the client again that the wallet ended this session, if it did. */
	function reportEnded(sessionId: string): void {
		if (!endedByWallet.has(sessionId)) return;
		getSetup().context.emit("session:disconnected", {
			sessionId,
			reason: "wallet",
		});
	}

	async function send<R>(
		sent: Promise<R>,
		signal: AbortSignal | undefined,
		sessionId: string,
	): Promise<R> {
		try {
			return await withAbort(sent, signal);
		} catch (error) {
			throw toRequestError(error, sessionId);
		}
	}

	function toMalformedError(
		method: string,
		sessionId: string,
	): InvalidWalletResponseError {
		return new InvalidWalletResponseError(
			`The wallet sent a malformed answer to "${method}"`,
			{ sessionId },
		);
	}

	async function getBalances(
		instance: Instance<T>,
		sessionId: string,
		options: SdkRequestOptions,
	): Promise<CashConnectBalances> {
		const balances = await send(
			instance.dapp.getBalances(options),
			options.signal,
			sessionId,
		);
		if (!isBalances(balances)) throw toMalformedError("getBalances", sessionId);
		return balances;
	}

	async function getTokens(
		instance: Instance<T>,
		sessionId: string,
		options: SdkRequestOptions,
	): Promise<readonly TransactionOutput[]> {
		const outputs: unknown = await send(
			instance.dapp.getTokens(options),
			options.signal,
			sessionId,
		);
		if (!Array.isArray(outputs) || !outputs.every(isTransactionOutput)) {
			throw toMalformedError("getTokens", sessionId);
		}
		return outputs;
	}

	async function executeAction(
		instance: Instance<T>,
		session: Session<CashConnect<T>>,
		call: unknown,
		options: SdkRequestOptions,
	): Promise<CashConnectExecuteActionResult<T>> {
		const sessionId = session.id;
		if (
			typeof call !== "object" ||
			call === null ||
			!("action" in call) ||
			typeof call.action !== "string"
		) {
			throw new ConfigError(
				'"executeAction" takes an action name and its params',
				{ sessionId },
			);
		}
		const { action } = call;
		const params = toWireParams(
			instance.sdk,
			session,
			action,
			"params" in call ? call.params : undefined,
		);
		const { data, transactions, balanceChanges } = await send(
			instance.dapp.executeAction(action, params, options),
			options.signal,
			sessionId,
		);
		if (
			!transactions.every(isTransaction) ||
			!isBalanceChanges(balanceChanges)
		) {
			throw toMalformedError("executeAction", sessionId);
		}
		const result = {
			data: fromWireReturns(instance.sdk, session, action, data),
			transactions,
			balanceChanges,
		};
		// Sound because the values were decoded by the types the action's
		// template declares, which is what the result type is derived from.
		return result as CashConnectExecuteActionResult<T>;
	}

	return {
		protocol: "cashconnect",
		methods: { executeAction: { userInteraction: true } },

		setup(ctx) {
			const invalid = (config.allowedTokens ?? []).findIndex(
				(category) => !CATEGORY.test(category),
			);
			if (invalid !== -1) {
				throw new ConfigError(
					`allowedTokens[${invalid}] must be 64 lowercase hex characters`,
				);
			}
			setup = {
				context: ctx,
				records: createSessionRecords(ctx.storage, ctx.logger),
			};
		},

		async connect({ signal, onPairing }) {
			if (signal?.aborted) throw toAbortError(signal);
			if (disposed) throw createDisposedError();

			let sdk: Sdk;
			try {
				sdk = await withAbort(loadSdk(), signal);
			} catch (error) {
				throw toLoadError(error);
			}
			if (disposed) throw createDisposedError();

			// The SDK checks the template only when it answers the wallet, where a
			// failure reaches neither side.
			const checked = sdk.TemplateSchema.safeParse(config.template);
			if (!checked.success) throw toTemplateError(checked.error);

			const instance = createInstance(sdk, crypto.randomUUID());
			let paired: SdkDappSession;
			try {
				await withAbort(start(instance), signal).catch((error: unknown) => {
					throw toStartError(error);
				});
				if (disposed) throw createDisposedError();

				onPairing?.({ kind: "uri", uri: instance.dapp.createInviteUrl() });
				// The SDK's `pair()` does not notice a signal that is already
				// aborted, and gets no deadline: the caller's arrives as an abort.
				paired = await withAbort(
					instance.dapp.pair(signal === undefined ? {} : { signal }),
					signal,
				).catch((error: unknown) => {
					throw toPairingError(error);
				});
				if (disposed) throw createDisposedError();
			} catch (error) {
				void abandon(instance);
				throw error;
			}
			return establish(instance, paired);
		},

		async restore() {
			const chain = chains[getSetup().context.network];
			const slots = await getSetup().records.slots();
			const held = await Promise.all(
				slots.map(async (slot) => ({
					slot,
					record: await getSetup().records.read(slot),
				})),
			);
			// A session of another network is valid there; it is only skipped.
			const here = held.flatMap(({ slot, record }) =>
				record?.chain === chain ? [{ slot, template: record.template }] : [],
			);
			if (here.length === 0) return [];

			let sdk: Sdk;
			try {
				sdk = await loadSdk();
			} catch (error) {
				if (disposed) return [];
				throw toLoadError(error);
			}
			if (disposed) return [];

			const template = toTemplateHash(sdk.Hasher, config.template);
			const resuming: Promise<Resumed<T>>[] = [];
			for (const item of here) {
				if (item.template === template) resuming.push(resume(sdk, item.slot));
				else void endStale(sdk, item.slot);
			}
			const resumed = await Promise.all(resuming);
			if (disposed) return [];

			const failed = resumed.flatMap((outcome) =>
				"reason" in outcome ? [outcome] : [],
			);
			const [first] = failed;
			// A relay that is down is transient: the records stay for the next load.
			if (first !== undefined && failed.length === resumed.length) {
				throw toStartError(first.reason);
			}
			// Only the sessions the wallet has not ended in the meantime.
			return resumed.flatMap((outcome) =>
				"instance" in outcome && outcome.instance.session !== undefined
					? [outcome.instance.session]
					: [],
			);
		},

		async disconnect(session) {
			const instance = live.get(session.id);
			if (instance === undefined) return;
			// First, so the end the SDK reports back is not taken for the wallet's.
			live.delete(session.id);
			instance.session = undefined;
			// The record goes at once: the SDK can take seconds to reach the relay.
			await instance.store.close();
			await forget(instance, DISCONNECTED);
			await stop(instance);
		},

		async request<M extends MethodName<CashConnect<T>>>(
			session: Session<CashConnect<T>>,
			method: M,
			params: unknown,
			opts: RequestOptions = {},
		): Promise<MethodResult<CashConnect<T>, M>> {
			const { signal, timeoutMs } = opts;
			const sessionId = session.id;

			if (!isMethod(method)) {
				throw new MethodUnsupportedError(
					`CashConnect has no method "${method}"`,
					{ sessionId },
				);
			}

			if (signal?.aborted) throw toAbortError(signal);

			const instance = live.get(sessionId);
			if (instance?.session === undefined) {
				reportEnded(sessionId);
				throw new SessionMissingError(
					"The CashConnect session is not connected",
					{ sessionId },
				);
			}

			const options: SdkRequestOptions = {
				timeoutMs: timeoutMs ?? NO_DEADLINE_MS,
				...(signal === undefined ? {} : { signal }),
			};
			const answer =
				method === "getBalances"
					? getBalances(instance, sessionId, options)
					: method === "getTokens"
						? getTokens(instance, sessionId, options)
						: executeAction(instance, instance.session, params, options);
			// Sound because each branch resolves with the result of the method
			// it serves, which the type of `method` cannot tell the compiler.
			return (await answer) as MethodResult<CashConnect<T>, M>;
		},

		subscribe(session, _event, listener) {
			const instance = live.get(session.id);
			if (instance === undefined) {
				reportEnded(session.id);
				return () => {};
			}
			instance.listeners.add(listener);
			return () => {
				instance.listeners.delete(listener);
			};
		},

		capabilitiesOf() {
			return new Set<CashConnect<T>["capability"]>(["template-execution"]);
		},

		async dispose() {
			disposed = true;
			live.clear();
			await Promise.all(
				[...instances].map((instance) => {
					instance.session = undefined;
					return stop(instance);
				}),
			);
		},
	};
}
