import {
	type KeyValueStore,
	type Logger,
	stringifyExtendedJson,
} from "@bchconnect/core";
import {
	isChain,
	isHex,
	isNonNegativeInteger,
	isStringList,
} from "./guards.js";
import type {
	SdkHasherClass,
	SdkPairedState,
	SdkSessionState,
	SdkSessionStore,
} from "./sdk.js";
import type { CashConnectTemplate } from "./template.js";
import type { CashConnectChain } from "./types.js";

const INDEX = "sessions";
const VERSION = 1;
// Keys and SHA-256 hashes are 32 bytes.
const HEX_LENGTH = 64;

/**
 * What a slot's record holds besides the SDK's state: the session's chain
 * and the template it was paired with.
 *
 * @internal
 */
export interface SlotBinding {
	readonly chain: CashConnectChain;
	/** SHA-256 of the template, hex. */
	readonly template: string;
}

/**
 * The record of one slot that holds a paired session.
 *
 * @internal
 */
export interface SlotRecord extends SlotBinding {
	readonly state: SdkPairedState;
}

/**
 * The SDK store of one `Dapp` instance.
 *
 * @internal
 */
export interface SlotStore extends SdkSessionStore {
	/** Erases the slot's record now, and ignores every later write. */
	close(): Promise<void>;
}

/**
 * The paired sessions this connector keeps in its storage namespace: an index
 * of slots, which tells whether there is anything to restore without loading
 * the SDK, and one record per slot. Every change runs after the previous one,
 * and no write rejects: a failed one is logged.
 *
 * @internal
 */
export interface SessionRecords {
	/** The slots holding a paired session, in the order they paired. */
	slots(): Promise<string[]>;
	/** The slot's record. An unreadable one is erased, with a warning. */
	read(slot: string): Promise<SlotRecord | undefined>;
	/** Erases the slot's record and its index entry. */
	erase(slot: string): Promise<void>;
	/**
	 * The SDK store for the instance whose `sessionKey` is `slot`. A write
	 * with a wallet key records the session under `binding`; a write without
	 * one erases it, so an unpaired identity is never stored.
	 */
	open(slot: string, binding: SlotBinding): SlotStore;
}

/**
 * The hash a slot's record keeps of the template its session was paired
 * with: the SHA-256 of the template's extended JSON, hex.
 *
 * @internal
 */
export function toTemplateHash(
	hasher: SdkHasherClass,
	template: CashConnectTemplate,
): string {
	return hasher.fromUTF8(stringifyExtendedJson(template)).sha256().toHex();
}

function toSlotKey(slot: string): string {
	return `slot:${slot}`;
}

function isPairedState(value: unknown): value is SdkPairedState {
	return (
		typeof value === "object" &&
		value !== null &&
		"privateKeyHex" in value &&
		isHex(value.privateKeyHex, HEX_LENGTH) &&
		"walletPubkey" in value &&
		isHex(value.walletPubkey, HEX_LENGTH) &&
		"allowedTokens" in value &&
		isStringList(value.allowedTokens) &&
		(!("lastEventTimestamp" in value) ||
			isNonNegativeInteger(value.lastEventTimestamp))
	);
}

function parseIndex(raw: string): string[] | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"v" in parsed &&
			parsed.v === VERSION &&
			"slots" in parsed &&
			isStringList(parsed.slots)
		) {
			return parsed.slots;
		}
	} catch {
		// Unreadable, handled by the caller like an unknown version.
	}
	return undefined;
}

function parseRecord(raw: string): SlotRecord | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"v" in parsed &&
			parsed.v === VERSION &&
			"chain" in parsed &&
			isChain(parsed.chain) &&
			"template" in parsed &&
			isHex(parsed.template, HEX_LENGTH) &&
			"state" in parsed &&
			isPairedState(parsed.state)
		) {
			return {
				chain: parsed.chain,
				template: parsed.template,
				state: parsed.state,
			};
		}
	} catch {
		// Unreadable, handled by the caller like an unknown version.
	}
	return undefined;
}

/**
 * Creates the session records kept in `storage`.
 *
 * @internal
 */
export function createSessionRecords(
	storage: KeyValueStore,
	logger: Logger,
): SessionRecords {
	let queue: Promise<unknown> = Promise.resolve();

	function enqueue<T>(task: () => Promise<T>): Promise<T> {
		const next = queue.then(task);
		queue = next.catch(() => {});
		return next;
	}

	// The SDK does not wait for most of its writes, so a rejection here would
	// be unhandled.
	async function persist(task: () => Promise<void>): Promise<void> {
		try {
			await task();
		} catch {
			logger.warn("A CashConnect session record could not be written");
		}
	}

	async function readSlots(): Promise<string[]> {
		const raw = await storage.get(INDEX);
		if (raw === undefined) return [];
		const slots = parseIndex(raw);
		if (slots !== undefined) return slots;

		logger.warn("Erasing an unreadable CashConnect session index");
		await persist(() => storage.delete(INDEX));
		return [];
	}

	async function writeSlots(slots: readonly string[]): Promise<void> {
		if (slots.length === 0) return storage.delete(INDEX);
		await storage.set(INDEX, JSON.stringify({ v: VERSION, slots }));
	}

	async function eraseSlot(slot: string): Promise<void> {
		await storage.delete(toSlotKey(slot));
		const slots = await readSlots();
		if (slots.includes(slot)) {
			await writeSlots(slots.filter((item) => item !== slot));
		}
	}

	// The slot is indexed before its record is written, and its record erased
	// before it leaves the index, so an interrupted change never leaves a key
	// stored that the index does not lead to.
	async function writeRecord(
		slot: string,
		binding: SlotBinding,
		state: SdkSessionState,
	): Promise<void> {
		const slots = await readSlots();
		if (!slots.includes(slot)) await writeSlots([...slots, slot]);
		await storage.set(
			toSlotKey(slot),
			JSON.stringify({
				v: VERSION,
				chain: binding.chain,
				template: binding.template,
				state,
			}),
		);
	}

	async function readRecord(slot: string): Promise<SlotRecord | undefined> {
		const raw = await storage.get(toSlotKey(slot));
		const record = raw === undefined ? undefined : parseRecord(raw);
		if (raw !== undefined && record === undefined) {
			logger.warn("Erasing an unreadable CashConnect session record");
		}
		if (record === undefined) await persist(() => eraseSlot(slot));
		return record;
	}

	return {
		slots() {
			return enqueue(readSlots);
		},
		read(slot) {
			return enqueue(() => readRecord(slot));
		},
		erase(slot) {
			return enqueue(() => persist(() => eraseSlot(slot)));
		},
		open(slot, binding) {
			let closed = false;
			return {
				async get(key) {
					return (await enqueue(() => readRecord(key)))?.state;
				},
				set(key, state) {
					if (closed) return Promise.resolve();
					return enqueue(() =>
						persist(() =>
							state.walletPubkey === undefined
								? eraseSlot(key)
								: writeRecord(key, binding, state),
						),
					);
				},
				delete(key) {
					return enqueue(() => persist(() => eraseSlot(key)));
				},
				list() {
					return enqueue(readSlots);
				},
				close() {
					closed = true;
					return enqueue(() => persist(() => eraseSlot(slot)));
				},
			};
		},
	};
}
