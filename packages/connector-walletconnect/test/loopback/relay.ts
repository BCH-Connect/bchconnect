import { type WebSocket, WebSocketServer } from "ws";

/** A message the relay was asked to publish. */
export interface Published {
	readonly topic: string;
	readonly tag: number | undefined;
}

/** A WalletConnect relay on localhost that keeps everything in memory. */
export interface Relay {
	/** The URL to pass as `relayUrl`. */
	readonly url: string;
	/** Every message published so far, in order. */
	readonly published: readonly Published[];
	/** How many open connections subscribe to `topic`. */
	subscribers(topic: string): number;
	/** Drops every client connection, as a network loss would. */
	dropAll(): void;
	close(): Promise<void>;
}

interface Envelope {
	readonly message: string | undefined;
	readonly tag: number | undefined;
	readonly attestation: string | undefined;
}

interface RelayParams {
	readonly topic?: string;
	readonly topics?: string[];
	readonly message?: string;
	readonly tag?: number;
	readonly attestation?: string;
	readonly pairingTopic?: string;
	readonly sessionTopic?: string;
	readonly sessionProposal?: string;
	readonly sessionProposalResponse?: string;
	readonly sessionSettlementRequest?: string;
}

interface RelayRequest {
	readonly id: number;
	readonly method?: string;
	readonly params?: RelayParams;
}

/**
 * Starts a relay that speaks enough of the WalletConnect relay protocol for
 * two sign clients to pair, settle a session and exchange requests.
 * Messages for a topic nobody subscribes to yet wait for its first subscriber.
 */
export async function startRelay(): Promise<Relay> {
	const server = new WebSocketServer({ port: 0 });
	await new Promise<void>((resolve) => server.once("listening", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("The relay has no port");
	}

	const subscribers = new Map<string, Set<WebSocket>>();
	const mailbox = new Map<string, Envelope[]>();
	const published: Published[] = [];
	let nextId = 1;

	function deliver(socket: WebSocket, topic: string, envelope: Envelope): void {
		socket.send(
			JSON.stringify({
				id: Date.now() * 1000 + nextId++,
				jsonrpc: "2.0",
				method: "irn_subscription",
				params: {
					id: `sub-${topic}`,
					data: { topic, publishedAt: Date.now(), ...envelope },
				},
			}),
		);
	}

	function publish(from: WebSocket, topic: string, envelope: Envelope): void {
		published.push({ topic, tag: envelope.tag });
		const targets = [...(subscribers.get(topic) ?? [])].filter(
			(socket) => socket !== from,
		);
		if (targets.length === 0) {
			mailbox.set(topic, [...(mailbox.get(topic) ?? []), envelope]);
		}
		for (const socket of targets) deliver(socket, topic, envelope);
	}

	function subscribe(socket: WebSocket, topic: string): void {
		const set = subscribers.get(topic) ?? new Set();
		set.add(socket);
		subscribers.set(topic, set);
		const queued = mailbox.get(topic) ?? [];
		mailbox.delete(topic);
		for (const envelope of queued) deliver(socket, topic, envelope);
	}

	function handle(socket: WebSocket, request: RelayRequest): unknown {
		const p = request.params ?? {};
		switch (request.method) {
			case "irn_subscribe":
				subscribe(socket, p.topic ?? "");
				return `sub-${p.topic}`;
			case "irn_batchSubscribe":
				for (const topic of p.topics ?? []) subscribe(socket, topic);
				return (p.topics ?? []).map((topic) => `sub-${topic}`);
			case "irn_unsubscribe":
				subscribers.get(p.topic ?? "")?.delete(socket);
				return true;
			case "irn_publish":
				publish(socket, p.topic ?? "", {
					message: p.message,
					tag: p.tag,
					attestation: p.attestation,
				});
				return true;
			case "irn_batchFetchMessages":
				return { messages: [], hasMore: false };
			// The SDK publishes the proposal and the approval through these combined methods.
			case "wc_proposeSession":
				subscribe(socket, p.pairingTopic ?? "");
				publish(socket, p.pairingTopic ?? "", {
					message: p.sessionProposal,
					tag: 1100,
					attestation: p.attestation,
				});
				return true;
			case "wc_approveSession":
				subscribe(socket, p.sessionTopic ?? "");
				publish(socket, p.pairingTopic ?? "", {
					message: p.sessionProposalResponse,
					tag: 1101,
					attestation: undefined,
				});
				publish(socket, p.sessionTopic ?? "", {
					message: p.sessionSettlementRequest,
					tag: 1102,
					attestation: undefined,
				});
				return true;
			default:
				return true;
		}
	}

	server.on("connection", (socket) => {
		socket.on("close", () => {
			for (const set of subscribers.values()) set.delete(socket);
		});
		socket.on("message", (raw) => {
			const request: RelayRequest = JSON.parse(raw.toString());
			// A client's acknowledgement of a delivered message.
			if (request.method === undefined) return;
			const result = handle(socket, request);
			socket.send(JSON.stringify({ id: request.id, jsonrpc: "2.0", result }));
		});
	});

	return {
		url: `ws://localhost:${address.port}`,
		published,
		subscribers(topic) {
			return subscribers.get(topic)?.size ?? 0;
		},
		dropAll() {
			for (const socket of server.clients) socket.terminate();
		},
		close() {
			for (const socket of server.clients) socket.terminate();
			return new Promise((resolve) => server.close(() => resolve()));
		},
	};
}
