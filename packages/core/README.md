# @bchconnect/core

The core package of [BCH Connect](https://github.com/BCH-Connect/bchconnect),
a wallet-connection library for Bitcoin Cash dapps.

> This package is in alpha and not yet stable. Expect breaking changes.

## Install

```sh
npm install @bchconnect/core
```

Core has no runtime dependencies. You'll also need a connector package for each
protocol your dapp supports, such as `@bchconnect/connector-wizardconnect`.

## Usage

With the ready-made modal from
[`@bchconnect/ui`](https://github.com/BCH-Connect/bchconnect/tree/main/packages/ui),
`connect()` needs no arguments: the user picks a wallet, scans or opens the
link, and a toast confirms the connection.

```ts
import { createClient, isBchConnectError } from "@bchconnect/core";
import { wizardConnect } from "@bchconnect/connector-wizardconnect";
import { bchconnectModal } from "@bchconnect/ui";

const client = createClient({
	connectors: [wizardConnect()],
	network: "mainnet",
	appMetadata: { name: "My dapp", url: "https://example.com" },
	ui: bchconnectModal(),
});

await client.init(); // restores sessions from the previous visit

try {
	const session = await client.connect();
	console.log(session.wallet.name);
} catch (error) {
	if (isBchConnectError(error, "ABORTED")) {
		// The user closed the modal.
	}
}
```

Requests, events and sessions are typed by the connectors you pass.

To draw your own modal with the same behaviour, pass `headlessModal(renderer)`
from `@bchconnect/ui/headless` as `ui`. Without a `ui`, render the pairing
yourself:

```ts
const session = await client.connect("wizardconnect", {
	onPairing: (pairing) => {
		if (pairing.kind === "uri") showQrCode(pairing.uri);
	},
});
```

## Requirements

- Node.js 22 or later, or a browser with `crypto.randomUUID`.
- TypeScript 5.9 or later, for typed usage.
- ESM and CommonJS builds are both included.

## License

[MIT](https://github.com/BCH-Connect/bchconnect/blob/main/LICENSE)
