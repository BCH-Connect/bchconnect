import type { KeyValueStore, Logger } from "@bchconnect/core";
import { isStringList } from "./guards.js";

const KEY = "sessions";
const VERSION = 1;

/**
 * The topics of the sessions this connector established, kept in its storage
 * namespace. It tells whether there is anything to restore without loading
 * the SDK, and tells this connector's sessions apart from other WalletConnect
 * code on the same origin.
 */
export interface SessionRecord {
	/** The recorded topics, in the order they were added. */
	topics(): Promise<string[]>;
	/** Records a topic. Recording it twice keeps one entry. */
	add(topic: string): Promise<void>;
	/** Forgets topics. Unknown ones are ignored. */
	remove(topics: readonly string[]): Promise<void>;
}

/** Creates the session record kept in `storage`. */
export function createRecord(
	storage: KeyValueStore,
	logger: Logger,
): SessionRecord {
	// Changes run one after another, so concurrent ones never overwrite each other.
	let queue: Promise<unknown> = Promise.resolve();

	async function read(): Promise<string[]> {
		const raw = await storage.get(KEY);
		if (raw === undefined) return [];

		try {
			const parsed: unknown = JSON.parse(raw);
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				"v" in parsed &&
				parsed.v === VERSION &&
				"topics" in parsed &&
				isStringList(parsed.topics)
			) {
				return parsed.topics;
			}
		} catch {
			// Unreadable, handled below like an unknown version.
		}
		logger.warn("Ignoring an unreadable WalletConnect session record");
		return [];
	}

	async function write(topics: readonly string[]): Promise<void> {
		if (topics.length === 0) return storage.delete(KEY);
		await storage.set(KEY, JSON.stringify({ v: VERSION, topics }));
	}

	function change(update: (topics: string[]) => string[]): Promise<void> {
		const next = queue.then(async () => write(update(await read())));
		queue = next.catch(() => {});
		return next;
	}

	return {
		topics() {
			const next = queue.then(read);
			queue = next.catch(() => {});
			return next;
		},
		add(topic) {
			return change((topics) =>
				topics.includes(topic) ? topics : [...topics, topic],
			);
		},
		remove(removed) {
			return change((topics) =>
				topics.filter((topic) => !removed.includes(topic)),
			);
		},
	};
}
