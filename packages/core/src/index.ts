/**
 * Core of BCH Connect: protocol-agnostic sessions, requests and lifecycle for
 * Bitcoin Cash wallet connections.
 *
 * @packageDocumentation
 */

export { createClient } from "./client/create-client.js";
export {
	parseExtendedJson,
	stringifyExtendedJson,
} from "./codec/extended-json.js";
export type { BchConnectErrorCode } from "./errors.js";
export {
	AbortedError,
	BchConnectError,
	CapabilityMissingError,
	ConfigError,
	InvalidWalletResponseError,
	isBchConnectError,
	MethodUnsupportedError,
	NetworkMismatchError,
	RequestRejectedError,
	SessionMissingError,
	TimeoutError,
	TransportError,
} from "./errors.js";
export { signMessage } from "./helpers/sign-message.js";
export { signTransaction } from "./helpers/sign-transaction.js";
export { cookieToInitialState } from "./snapshot.js";
export { cookieStorage } from "./storage/cookie.js";
export { localStorage } from "./storage/local-storage.js";
export { memory } from "./storage/memory.js";
export type {
	CapabilityMap,
	CapabilityRegistry,
	LibauthSigning,
	MessageSigning,
	SessionClient,
} from "./types/capabilities.js";
export type {
	CapabilityFor,
	Client,
	ClientConfig,
	ClientLifecycle,
	ClientSnapshot,
	ClientState,
	ClientStatus,
	ClientStore,
	ConnectOptions,
	ConnectorEventName,
	LifecycleEvents,
	ProtocolFor,
	ProtocolOf,
	Register,
	RegisteredClient,
	RegisteredSession,
} from "./types/client.js";
export type {
	AppMetadata,
	Connector,
	ConnectorContext,
	EventName,
	EventPayload,
	KeyValueStore,
	Logger,
	MethodDefinition,
	MethodMetadata,
	MethodName,
	MethodParams,
	MethodResult,
	Network,
	Pairing,
	ProtocolDefinition,
	RequestOptions,
	Session,
	SessionOf,
	SessionStatus,
	WalletIdentity,
} from "./types/protocol.js";
export type {
	AbiFunction,
	AbiInput,
	ContractArtifact,
	ContractDisplay,
	NonFungibleTokenCapability,
	SignMessageRequest,
	SignMessageResponse,
	SignTransactionRequest,
	SignTransactionResponse,
	SourceOutput,
	TokenData,
	Transaction,
	TransactionInput,
	TransactionOutput,
} from "./types/transaction.js";
