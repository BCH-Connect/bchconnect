// Compiled against the packed tarball, not the sources: every import here
// resolves through the package's exports to its published declarations.
import {
	type ClientLifecycle,
	type Connector,
	cookieToInitialState,
	createClient,
	isBchConnectError,
	memory,
	type ProtocolDefinition,
	parseExtendedJson,
	type SignTransactionRequest,
	type SignTransactionResponse,
	signMessage,
	signTransaction,
	stringifyExtendedJson,
} from "@bchconnect/core";

interface Demo extends ProtocolDefinition {
	id: "demo";
	session: { readonly addresses: readonly string[] };
	methods: {
		get_balance: {
			params: { readonly address: string };
			result: { readonly sats: bigint };
		};
		sign_transaction: {
			params: { readonly transaction: SignTransactionRequest };
			result: SignTransactionResponse;
			userInteraction: true;
		};
	};
	events: { addresses_changed: { readonly addresses: readonly string[] } };
	capability: "libauth-signing" | "message-signing";
}

interface Other extends ProtocolDefinition {
	id: "other";
	session: { readonly pubkey: string };
	methods: Record<never, never>;
	events: Record<never, never>;
	capability: never;
}

declare const demo: Connector<Demo>;
declare const other: Connector<Other>;

const client = createClient({
	connectors: [demo, other],
	network: "chipnet",
	appMetadata: { name: "Consumer", url: "https://example.com" },
	storage: memory(),
});

declare module "@bchconnect/core" {
	interface Register {
		client: typeof client;
	}
}

function mount(lifecycle: ClientLifecycle): () => void {
	return lifecycle.store.subscribe(() => {
		const { status } = lifecycle.store.getState();
		if (status === "disposed") return;
	});
}

export async function run(): Promise<bigint> {
	mount(client);
	cookieToInitialState(client, "");
	await client.init();

	const session = await client.connect("demo", { mode: "add" });
	const addresses: readonly string[] = session.data.addresses;
	const { sats } = await client.request(session, "get_balance", {
		address: addresses[0] ?? "",
	});

	client.subscribe(session, "addresses_changed", ({ addresses: next }) => {
		void next.length;
	});

	if (client.can(session, "libauth-signing")) {
		await signTransaction(client, session, {
			transaction: "00",
			sourceOutputs: [],
		});
	}

	try {
		await signMessage(client, session, { message: "hello" });
	} catch (error) {
		if (isBchConnectError(error, "REJECTED")) void error.by;
	}

	const otherSession = client.session("other");
	if (otherSession !== null) void otherSession.data.pubkey;

	const roundTrip = parseExtendedJson(stringifyExtendedJson({ sats }));
	void roundTrip;
	return sats;
}
