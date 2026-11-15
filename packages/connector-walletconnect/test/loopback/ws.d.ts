// The slice of `ws` the in-memory relay uses; the package ships no types of its own.
declare module "ws" {
	export interface WebSocket {
		send(data: string): void;
		terminate(): void;
		on(
			event: "message",
			listener: (data: { toString(): string }) => void,
		): this;
		on(event: "close", listener: () => void): this;
	}

	export class WebSocketServer {
		constructor(options: { port: number });
		readonly clients: Set<WebSocket>;
		address(): { port: number } | string | null;
		close(callback?: () => void): void;
		once(event: "listening", listener: () => void): this;
		on(event: "connection", listener: (socket: WebSocket) => void): this;
	}
}
