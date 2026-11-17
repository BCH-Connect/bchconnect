import { vi } from "vitest";

/** An event as a client published it. */
export interface RelayEvent {
	readonly id: string;
	readonly pubkey: string;
	// biome-ignore lint/style/useNamingConvention: the event's field name on the wire.
	readonly created_at: number;
	readonly kind: number;
	readonly tags: readonly (readonly string[])[];
}

/** A Nostr relay that keeps everything in memory and serves the global `WebSocket`. */
export interface Relay {
	/** Every event published so far, in order. */
	readonly events: readonly RelayEvent[];
	/** The URL of every connection asked for so far, in order. */
	readonly urls: readonly string[];
	/** How many connections are open. */
	openSockets(): number;
	/** Closes the connection opened last without an error, as a network loss would. */
	dropLatest(): void;
	/** Fails every new connection with an error, until {@link Relay.accept}. */
	refuse(): void;
	/** Opens new connections again. */
	accept(): void;
	/** Closes every connection and restores every stubbed global. */
	close(): void;
}

interface Filter {
	readonly ids?: readonly string[];
	readonly kinds?: readonly number[];
	readonly since?: number;
	readonly "#p"?: readonly string[];
}

type Frame =
	| readonly ["EVENT", RelayEvent]
	| readonly ["REQ", string, Filter]
	| readonly ["CLOSE", string];

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

function matches(filter: Filter, event: RelayEvent): boolean {
	const recipients = filter["#p"];
	return (
		(filter.ids === undefined || filter.ids.includes(event.id)) &&
		(filter.kinds === undefined || filter.kinds.includes(event.kind)) &&
		// Inclusive: the SDK resumes from the time of the last event it saw.
		(filter.since === undefined || event.created_at >= filter.since) &&
		(recipients === undefined ||
			event.tags.some(
				([name, value]) =>
					name === "p" && value !== undefined && recipients.includes(value),
			))
	);
}

/**
 * Starts a relay that speaks enough of NIP-01 for the two sides of the SDK to
 * pair and exchange requests, and installs it as the global `WebSocket`, so
 * no connection ever leaves the process. Events are stored as given: the SDK
 * checks signatures and expiry itself.
 */
export function startRelay(): Relay {
	const events: RelayEvent[] = [];
	const urls: string[] = [];
	const sockets: RelaySocket[] = [];
	let refusing = false;

	class RelaySocket {
		static readonly OPEN = OPEN;

		readyState: number = CONNECTING;
		onopen: (() => void) | null = null;
		onerror: ((event: Event) => void) | null = null;
		onclose: (() => void) | null = null;
		onmessage: ((message: { data: string }) => void) | null = null;
		readonly subscriptions = new Map<string, Filter>();

		constructor(url: string) {
			urls.push(url);
			// A socket never opens or fails before its creator set the handlers.
			queueMicrotask(() => {
				if (this.readyState !== CONNECTING) return;
				if (refusing) {
					this.readyState = CLOSED;
					this.onerror?.(new Event("error"));
					this.onclose?.();
					return;
				}
				this.readyState = OPEN;
				sockets.push(this);
				this.onopen?.();
			});
		}

		send(data: string): void {
			if (this.readyState !== OPEN) {
				throw new Error("The connection is not open");
			}
			const frame: Frame = JSON.parse(data);
			if (frame[0] === "EVENT") {
				const event = frame[1];
				events.push(event);
				this.deliver(["OK", event.id, true]);
				for (const socket of sockets) {
					for (const [id, filter] of socket.subscriptions) {
						if (matches(filter, event)) socket.deliver(["EVENT", id, event]);
					}
				}
			} else if (frame[0] === "REQ") {
				const [, id, filter] = frame;
				this.subscriptions.set(id, filter);
				for (const event of events) {
					if (matches(filter, event)) this.deliver(["EVENT", id, event]);
				}
				this.deliver(["EOSE", id]);
			} else {
				this.subscriptions.delete(frame[1]);
			}
		}

		close(): void {
			if (this.readyState === CLOSED) return;
			this.readyState = CLOSED;
			this.subscriptions.clear();
			const index = sockets.indexOf(this);
			if (index !== -1) sockets.splice(index, 1);
			this.onclose?.();
		}

		/** Sends a frame to the client, after the call that caused it returns. */
		deliver(frame: readonly unknown[]): void {
			const data = JSON.stringify(frame);
			queueMicrotask(() => {
				if (this.readyState === OPEN) this.onmessage?.({ data });
			});
		}
	}

	vi.stubGlobal("WebSocket", RelaySocket);

	return {
		events,
		urls,
		openSockets() {
			return sockets.length;
		},
		dropLatest() {
			sockets.at(-1)?.close();
		},
		refuse() {
			refusing = true;
		},
		accept() {
			refusing = false;
		},
		close() {
			for (const socket of [...sockets]) socket.close();
			vi.unstubAllGlobals();
		},
	};
}
