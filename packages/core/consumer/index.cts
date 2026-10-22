// The require condition ships its own declarations; check them too.
import core = require("@bchconnect/core");

import type { ClientLifecycle } from "@bchconnect/core";

const storage = core.memory();
const client: ClientLifecycle = core.createClient({
	connectors: [],
	network: "mainnet",
	appMetadata: { name: "Consumer", url: "https://example.com" },
	storage,
});

export = client;
