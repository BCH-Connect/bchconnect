import {
	AbortedError,
	type BchConnectError,
	type CapabilityMap,
	ConfigError,
	type Connector,
	type ConnectorContext,
	InvalidWalletResponseError,
	isBchConnectError,
	type LifecycleEvents,
	MethodUnsupportedError,
	NetworkMismatchError,
	type Session,
	SessionMissingError,
	type SessionStatus,
	stringifyExtendedJson,
	TransportError,
} from "@bchconnect/core";
import { chains } from "./chains.js";
import { isSessionEnd, toPairingError, toRequestError } from "./errors.js";
import { isValidResult } from "./guards.js";
import { createRecord, type SessionRecord } from "./record.js";
import {
	loadSignClient,
	type SdkSession,
	type SdkSessionEnd,
	type SdkSessionEvent,
	type SdkSessionUpdate,
	type SdkSignClient,
} from "./sdk.js";
import { parseData, toSession } from "./session.js";
import type { WalletConnect, WalletConnectConfig } from "./types.js";

const PROPOSED_METHODS = [
	"bch_getAddresses",
	"bch_signTransaction",
	"bch_signMessage",
] as const;
const CANCEL_METHOD = "bch_cancelPendingRequests"; // Method only implemented in Cashonize
const USER_DISCONNECTED = {
	code: 6000,
	message: "User disconnected.",
} as const;
// The SDK refuses request expiries outside this range, in seconds.
const MIN_EXPIRY = 300;
const MAX_EXPIRY = 604_800;

type Answer = { readonly session: SdkSession } | { readonly reason: unknown };

interface Proposal {
	readonly uri: string | undefined;
	readonly answer: Promise<Answer>;
}

type SessionEndReason = LifecycleEvents["session:disconnected"]["reason"];

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

function isSameList(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((item, index) => item === b[index]);
}

function toExpirySeconds(timeoutMs: number | undefined): number {
	if (timeoutMs === undefined) return MAX_EXPIRY;
	return Math.min(
		MAX_EXPIRY,
		Math.max(MIN_EXPIRY, Math.ceil(timeoutMs / 1000)),
	);
}

/** The pairing topic: the part of `wc:<topic>@2?…` before the `@`. */
function parsePairingTopic(uri: string | undefined): string | undefined {
	return uri?.match(/^wc:([^@]+)@/)?.[1];
}

function toStartError(error: unknown): BchConnectError {
	return isBchConnectError(error)
		? error
		: new TransportError("The WalletConnect client failed to start", {
				cause: error,
			});
}

/**
 * Creates the connector for the `bch-wc2` protocol over WalletConnect.
 *
 * The WalletConnect sign client is loaded only when a connection is made or a
 * recorded session is restored. Sessions last as long as the wallet keeps
 * them, up to seven days.
 *
 * @param config - The WalletConnect project id and, optionally, a relay URL.
 * @returns A connector to pass to `createClient`.
 *
 * @example
 * ```ts
 * import { createClient } from "@bchconnect/core";
 * import { walletConnect } from "@bchconnect/connector-walletconnect";
 *
 * const client = createClient({
 *   connectors: [walletConnect({ projectId: "your-project-id" })],
 *   network: "mainnet",
 *   appMetadata: { name: "My dapp", url: "https://dapp.example" },
 * });
 * ```
 *
 * @beta
 */
export function walletConnect(
	config: WalletConnectConfig,
): Connector<WalletConnect> {
	let context: ConnectorContext | undefined;
	let record: SessionRecord | undefined;
	let starting: Promise<SdkSignClient> | undefined;
	let client: SdkSignClient | undefined;
	let disposed = false;
	// The sessions this connector handed out and that have not ended.
	const live = new Map<string, Session<WalletConnect>>();
	// How many requests are in flight per session.
	const pending = new Map<string, number>();

	function getContext(): ConnectorContext {
		if (context === undefined) {
			throw new ConfigError("The WalletConnect connector was not set up");
		}
		return context;
	}

	function getRecord(): SessionRecord {
		record ??= createRecord(getContext().storage, getContext().logger);
		return record;
	}

	async function remember(topic: string): Promise<void> {
		return getRecord()
			.add(topic)
			.catch((error: unknown) =>
				getContext().logger.warn(
					"Recording the WalletConnect session failed",
					error,
				),
			);
	}

	async function forget(topics: readonly string[]): Promise<void> {
		return getRecord()
			.remove(topics)
			.catch((error: unknown) =>
				getContext().logger.warn(
					"Forgetting the WalletConnect session failed",
					error,
				),
			);
	}

	/**
	 * Ends a session in the SDK. Never rejects: the SDK throws when offline or
	 * when it is already gone. Once disposed it sends nothing.
	 */
	async function endInSdk(
		sdk: SdkSignClient | undefined,
		topic: string,
	): Promise<void> {
		if (sdk === undefined || disposed) return;
		try {
			await sdk.disconnect({ topic, reason: USER_DISCONNECTED });
		} catch (error) {
			getContext().logger.warn(
				"Ending the WalletConnect session failed",
				error,
			);
		}
	}

	function replace(
		next: Session<WalletConnect>,
		previous: Session<WalletConnect>,
	): void {
		live.set(next.id, next);
		getContext().emit("session:changed", { session: next, previous });
	}

	function end(topic: string, reason: SessionEndReason): void {
		if (!live.delete(topic)) return;
		getContext().emit("session:disconnected", { sessionId: topic, reason });
		void forget([topic]);
	}

	function setTransport(transport: SessionStatus["transport"]): void {
		for (const session of [...live.values()]) {
			if (session.status.transport === transport) continue;
			replace(
				{ ...session, status: { ...session.status, transport } },
				session,
			);
		}
	}

	function onUpdate({ topic, params }: SdkSessionUpdate): void {
		const previous = live.get(topic);
		if (previous === undefined) return;

		const parsed = parseData(params.namespaces, previous.data.chain);
		if ("error" in parsed) {
			void endInSdk(client, topic);
			end(topic, "error");
			return;
		}
		if (
			isSameList(parsed.data.addresses, previous.data.addresses) &&
			isSameList(parsed.data.methods, previous.data.methods)
		) {
			return;
		}
		replace({ ...previous, data: parsed.data }, previous);
	}

	function onDelete({ topic }: SdkSessionEnd): void {
		end(topic, "wallet");
	}

	function onExpire({ topic }: SdkSessionEnd): void {
		end(topic, "expired");
	}

	function onEvent({ params }: SdkSessionEvent): void {
		getContext().logger.debug(
			`Ignoring WalletConnect event "${params.event.name}"`,
		);
	}

	function onRelayConnect(): void {
		setTransport("connected");
	}

	function onRelayDisconnect(): void {
		setTransport("reconnecting");
	}

	function listen(sdk: SdkSignClient): void {
		sdk.on("session_update", onUpdate);
		sdk.on("session_delete", onDelete);
		sdk.on("session_expire", onExpire);
		sdk.on("session_event", onEvent);
		sdk.core.relayer.on("relayer_connect", onRelayConnect);
		sdk.core.relayer.on("relayer_disconnect", onRelayDisconnect);
	}

	// The relay connection stays open: the SDK shares it with every other
	// client on the page, and a closed one does not reopen for them.
	function release(sdk: SdkSignClient): void {
		sdk.off("session_update", onUpdate);
		sdk.off("session_delete", onDelete);
		sdk.off("session_expire", onExpire);
		sdk.off("session_event", onEvent);
		sdk.core.relayer.off("relayer_connect", onRelayConnect);
		sdk.core.relayer.off("relayer_disconnect", onRelayDisconnect);
	}

	function createDisposedError(): AbortedError {
		return new AbortedError("The WalletConnect connector was disposed");
	}

	async function start(): Promise<SdkSignClient> {
		const factory = await loadSignClient();
		if (disposed) throw createDisposedError();

		const { name, url, icon, description } = getContext().appMetadata;
		const sdk = await factory.init({
			projectId: config.projectId,
			...(config.relayUrl === undefined ? {} : { relayUrl: config.relayUrl }),
			metadata: {
				name,
				description: description ?? "",
				url,
				icons: icon === undefined ? [] : [icon],
			},
			telemetryEnabled: false,
		});
		if (disposed) {
			release(sdk);
			throw createDisposedError();
		}

		listen(sdk);
		client = sdk;
		return sdk;
	}

	// One client per connector: the SDK's core is shared across the page.
	function startSignClient(): Promise<SdkSignClient> {
		if (disposed) return Promise.reject(createDisposedError());
		starting ??= start().catch((error: unknown) => {
			starting = undefined;
			throw error;
		});
		return starting;
	}

	/**
	 * Gives up on a proposal. The SDK cannot cancel one, but deleting its
	 * pairing makes the wallet's approval fail; a session that still forms is
	 * ended.
	 */
	function abandon(sdk: SdkSignClient, proposal: Proposal): void {
		if (disposed) return;
		const topic = parsePairingTopic(proposal.uri);
		if (topic !== undefined) {
			sdk.core.pairing
				.disconnect({ topic })
				.catch((error: unknown) =>
					getContext().logger.debug(
						"Deleting an abandoned WalletConnect pairing failed",
						error,
					),
				);
		}
		void proposal.answer.then((answer) => {
			if ("session" in answer) void endInSdk(sdk, answer.session.topic);
		});
	}

	return {
		protocol: "bch-wc2",
		methods: {
			// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
			bch_signTransaction: { userInteraction: true },
			// biome-ignore lint/style/useNamingConvention: wallet-side wire method name.
			bch_signMessage: { userInteraction: true },
		},

		setup(ctx) {
			context = ctx;
		},

		async connect({ signal, onPairing }) {
			if (signal?.aborted) throw toAbortError(signal);

			let sdk: SdkSignClient;
			try {
				sdk = await withAbort(startSignClient(), signal);
			} catch (error) {
				throw signal?.aborted ? error : toStartError(error);
			}

			const chain = chains[getContext().network];
			// `approval()` runs as soon as the proposal exists: before it is called,
			// the SDK drops the wallet's answer.
			const proposing = sdk
				.connect({
					optionalNamespaces: {
						bch: {
							chains: [chain],
							methods: [...PROPOSED_METHODS, ...(config.methods ?? [])],
							events: ["addressesChanged"],
						},
					},
				})
				.then(
					({ uri, approval }): Proposal => ({
						uri,
						answer: approval().then(
							(session): Answer => ({ session }),
							(reason: unknown): Answer => ({ reason }),
						),
					}),
				);

			let proposal: Proposal;
			try {
				proposal = await withAbort(proposing, signal);
			} catch (error) {
				if (!signal?.aborted) throw toPairingError(error);
				void proposing.then(
					(late) => abandon(sdk, late),
					() => {},
				);
				throw error;
			}

			let answer: Answer;
			try {
				if (proposal.uri === undefined) {
					throw new TransportError(
						"The WalletConnect client returned no pairing URI",
					);
				}
				onPairing?.({ kind: "uri", uri: proposal.uri });
				answer = await withAbort(proposal.answer, signal);
			} catch (error) {
				abandon(sdk, proposal);
				throw error;
			}
			if ("reason" in answer) throw toPairingError(answer.reason);

			const built = toSession(
				answer.session,
				chain,
				sdk.core.relayer.connected,
			);
			if ("error" in built) {
				void endInSdk(sdk, answer.session.topic);
				throw built.error;
			}
			const sessionId = built.session.id;
			live.set(sessionId, built.session);
			await remember(sessionId);
			// The wallet can update or end the session while the record is written.
			const session = live.get(sessionId);
			if (session === undefined) {
				throw new SessionMissingError("The wallet ended the session", {
					sessionId,
				});
			}
			return session;
		},

		async restore() {
			const topics = await getRecord().topics();
			if (topics.length === 0) return [];

			let sdk: SdkSignClient;
			try {
				sdk = await startSignClient();
			} catch (error) {
				if (disposed) return [];
				throw toStartError(error);
			}

			const held = new Map(sdk.session.getAll().map((raw) => [raw.topic, raw]));
			const now = Date.now() / 1000;
			const restored: Session<WalletConnect>[] = [];
			const dropped: string[] = [];
			for (const topic of topics) {
				const raw = held.get(topic);
				if (raw === undefined || raw.expiry <= now) {
					dropped.push(topic);
					continue;
				}
				const built = toSession(
					raw,
					chains[getContext().network],
					sdk.core.relayer.connected,
				);
				if ("error" in built) {
					// A session of another network is valid there; it is only skipped.
					if (built.error instanceof NetworkMismatchError) continue;
					dropped.push(topic);
					void endInSdk(sdk, topic);
					continue;
				}
				restored.push(built.session);
				live.set(topic, built.session);
			}
			if (dropped.length > 0) await forget(dropped);

			return restored;
		},

		async disconnect(session) {
			const topic = session.id;
			// The record goes at once: the SDK can take seconds to reach the wallet.
			await Promise.all([
				forget([topic]),
				live.delete(topic) ? endInSdk(client, topic) : undefined,
			]);
		},

		async request(session, method, params, opts = {}) {
			const { signal, timeoutMs } = opts;
			const sessionId = session.id;

			if (!session.data.methods.includes(method)) {
				throw new MethodUnsupportedError(
					`The wallet did not approve "${method}" for this session`,
					{ sessionId },
				);
			}

			if (signal?.aborted) throw toAbortError(signal);

			const sdk = client;
			if (sdk === undefined || !live.has(sessionId)) {
				throw new SessionMissingError(
					"The WalletConnect session is not connected",
					{ sessionId },
				);
			}

			const chainId = session.data.chain;
			const sent = sdk.request({
				topic: sessionId,
				chainId,
				request: {
					method,
					// Wallets read bigints and bytes in the extended-JSON form, and
					// `{}` where a method takes no params.
					params:
						params === undefined
							? {}
							: JSON.parse(stringifyExtendedJson(params)),
				},
				expiry: toExpirySeconds(timeoutMs),
			});

			let result: unknown;
			pending.set(sessionId, (pending.get(sessionId) ?? 0) + 1);
			try {
				result = await withAbort(sent, signal);
			} catch (error) {
				if (signal?.aborted) {
					// The cancel dismisses every request the wallet holds for the session,
					// so it is sent only when this one was the last. Never awaited: the
					// wallet sees it only after answering the request it cancels.
					if (
						!disposed &&
						pending.get(sessionId) === 1 &&
						session.data.methods.includes(CANCEL_METHOD)
					) {
						sdk
							.request({
								topic: sessionId,
								chainId,
								request: { method: CANCEL_METHOD, params: {} },
							})
							.catch((cancelError: unknown) =>
								getContext().logger.debug(
									"Cancelling the WalletConnect request failed",
									cancelError,
								),
							);
					}
					throw error;
				}
				if (isSessionEnd(error)) {
					void endInSdk(sdk, sessionId);
					end(sessionId, "wallet");
					throw new SessionMissingError("The wallet ended the session", {
						sessionId,
						cause: error,
					});
				}
				throw toRequestError(error, sessionId);
			} finally {
				const left = (pending.get(sessionId) ?? 1) - 1;
				if (left === 0) pending.delete(sessionId);
				else pending.set(sessionId, left);
			}

			if (!isValidResult(method, result)) {
				throw new InvalidWalletResponseError(
					`The wallet sent a malformed answer to "${method}"`,
					{ sessionId },
				);
			}
			return result;
		},

		subscribe() {
			return () => {};
		},

		capabilitiesOf(session) {
			const capabilities = new Set<WalletConnect["capability"]>();
			if (session.data.methods.includes("bch_signTransaction")) {
				capabilities.add("libauth-signing");
			}
			if (session.data.methods.includes("bch_signMessage")) {
				capabilities.add("message-signing");
			}
			return capabilities;
		},

		capabilities(_session, sessionClient): CapabilityMap<WalletConnect> {
			return {
				"libauth-signing": {
					signTransaction: (req, opts) =>
						sessionClient.request("bch_signTransaction", req, opts),
				},
				"message-signing": {
					signMessage: (req, opts) =>
						sessionClient.request("bch_signMessage", req, opts),
				},
			};
		},

		async dispose() {
			disposed = true;
			// A client still starting is released by `start()` once it exists.
			if (client === undefined) return;
			release(client);
			client = undefined;
		},
	};
}
