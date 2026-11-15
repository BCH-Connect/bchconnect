# @bchconnect/connector-walletconnect

The WalletConnect connector of [BCH Connect](https://github.com/BCH-Connect/bchconnect),
a wallet-connection library for Bitcoin Cash dapps. It speaks the
[BCH WalletConnect protocol (bch-wc2)](https://github.com/mainnet-pat/wc2-bch-bcr) through
the WalletConnect sign client.

> This package is in alpha and not yet stable. Expect breaking changes.

## Install

```sh
npm install @bchconnect/core @bchconnect/connector-walletconnect @walletconnect/sign-client
```

`@walletconnect/sign-client` is a peer dependency. Install it in your dapp at
version `2.21.8` or later; the connector uses the version you install.

The connector imports the sign client dynamically, the first time a connection
starts or a saved session is restored. Bundlers emit it as a separate chunk,
so it is not part of your initial bundle and is never fetched on a visit where
neither happens.

## Usage

```ts
import { createClient, signMessage } from "@bchconnect/core";
import { walletConnect } from "@bchconnect/connector-walletconnect";
import { bchconnectModal } from "@bchconnect/ui/modal";

const client = createClient({
	connectors: [walletConnect({ projectId: "your-project-id" })],
	network: "mainnet",
	appMetadata: { name: "My dapp", url: "https://example.com" },
	ui: bchconnectModal(),
});

await client.init(); // restores sessions from the previous visit

const session = await client.connect();
console.log(session.data.addresses[0]);

const signature = await signMessage(client, session, { message: "Hello" });
```

Without a modal, pass `onPairing` and show the link yourself:

```ts
const session = await client.connect("bch-wc2", {
	onPairing: (pairing) => {
		if (pairing.kind === "uri") showQrCode(pairing.uri);
	},
});
```

## Options

| Option      | Description                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------- |
| `projectId` | Project id from the [WalletConnect dashboard](https://dashboard.walletconnect.com). Required. |
| `relayUrl`  | Relay URL. Defaults to the sign client's own relay.                                           |
| `methods`   | Custom methods to ask the wallet for, besides the standard three. Optional.                   |

## The session

`session.data` holds what the wallet approved:

| Field       | Description                                                                  |
| ----------- | ---------------------------------------------------------------------------- |
| `chain`     | `bch:bitcoincash`, `bch:bchtest` or `bch:bchreg`, from the client's network. |
| `addresses` | The wallet's cash addresses for that chain. The first is its primary one.    |
| `methods`   | The requests the wallet accepts in this session.                             |

A wallet may approve fewer requests than the connector asks for. Check before
you sign with `client.can(session, "libauth-signing")` or
`client.can(session, "message-signing")`.

## Requirements

- `@bchconnect/core` and `@walletconnect/sign-client` 2.21.8 or later, as peer
  dependencies.
- TypeScript 5.9 or later, for typed usage.
- ESM and CommonJS builds are both included.

## License

[MIT](https://github.com/BCH-Connect/bchconnect/blob/main/LICENSE)
