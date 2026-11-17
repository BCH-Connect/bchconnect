# @bchconnect/connector-cashconnect

The CashConnect connector of [BCH Connect](https://github.com/BCH-Connect/bchconnect),
a wallet-connection library for Bitcoin Cash dapps. It speaks the
[CashConnect](https://gitlab.com/cashconnect-js/cashconnect-js) protocol through the CashConnect SDK:
the dapp declares a template of actions, and the wallet runs them and signs
the transactions they build.

> This package is in alpha and not yet stable. Expect breaking changes.

> **Alpha.** CashConnect is a preview protocol: its author states it is not yet
> safe for production use and recommends chipnet until its 1.0 release, and
> its wire format still changes between versions. This connector pins one SDK
> version for that reason.

## Install

```sh
npm install @bchconnect/core @bchconnect/connector-cashconnect @cashconnect-js/nostr@1.0.0-alpha.31 @cashconnect-js/core@1.0.0-alpha.31
```

`@cashconnect-js/nostr` and `@cashconnect-js/core` are peer dependencies.
Install both at exactly `1.0.0-alpha.31`, the version Cashonize speaks: a dapp
and a wallet on different SDK versions may not understand each other.

The connector imports the SDK dynamically, the first time a connection starts
or a saved session is restored. Bundlers emit it as a separate chunk, so it is
not part of your initial bundle and is never fetched on a visit where neither
happens. The SDK uses top-level await, so your bundler must target ES2022 or
later.

## Usage

```ts
import { createClient } from "@bchconnect/core";
import {
	cashConnect,
	executeAction,
	sendTemplate,
} from "@bchconnect/connector-cashconnect";
import { bchconnectModal } from "@bchconnect/ui/modal";

const client = createClient({
	connectors: [cashConnect({ template: sendTemplate })],
	network: "chipnet",
	appMetadata: { name: "My dapp", url: "https://example.com" },
	ui: bchconnectModal(),
});

await client.init(); // restores sessions from the previous visit

const session = await client.connect();

const { data } = await executeAction(client, session, "send", {
	recipient: "bchtest:qr…",
	amount: 10_000n,
});
// data.tx is the signed transaction. The wallet does not broadcast it.
```

Without a modal, pass `onPairing` and show the invite yourself:

```ts
const session = await client.connect("cashconnect", {
	onPairing: (pairing) => {
		if (pairing.kind === "uri") showQrCode(pairing.uri);
	},
});
```

A wallet that declines the invite, runs on another network or uses another
relay sends nothing back. Give `connect()` a `timeoutMs` or a `signal` if the
dapp should stop waiting.

## Broadcasting

The wallet signs transactions and never broadcasts them. An action resolves
with `transactions`, the decoded transactions the wallet signed, and with
`data`, the values the action returns. With the templates shipped here,
`data.tx` holds the signed transaction's bytes: hex-encode them and send them
to an Electrum or Fulcrum server. `data.txHash` is the transaction id, in the
byte order explorers show.

## Options

| Option          | Description                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `template`      | The template whose actions the wallet runs. Required.                                           |
| `allowedTokens` | Token categories the dapp asks to see and spend, as 64-character lowercase hex. Default: none. |

## Templates

A template is plain data: named actions, each with the params it takes, the
instructions the wallet runs, and the values it returns. The wallet shows the
template when the session is approved and keeps that copy for the life of the
session.

Two templates are included:

| Template             | Action                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `sendTemplate`       | `send`: pays `amount` satoshis to `recipient`.                                                |
| `sendTokensTemplate` | `sendTokens`: pays `amount` fungible tokens of `category` to `recipient`, with 1000 satoshis. |

`sendTokensTemplate` has not been confirmed against a wallet yet. The
category must be one of the session's `allowedTokens`. `amount` must be
positive, and the connector does not check it: validate it before you call. The wallet may spend an
output of the category that also holds an NFT, and its change does not carry
the NFT on: do not use it with a category whose NFTs the wallet must keep.

You can pass your own template, written by hand or with the SDK's helpers.
Params and returned values are typed by what each variable declares:

| Declared type         | Value                                           |
| --------------------- | ----------------------------------------------- |
| `satoshis`, `number`  | `bigint`                                        |
| `string`              | `string`                                        |
| `address`             | A CashAddr `string` for the session's network. |
| Any other             | `Uint8Array`                                    |

The connector encodes params and decodes returned values, so the dapp never
imports the SDK's encoders. An address for another network is refused before
anything is sent.

Keep the template the same value across page loads, key order included. A
session paired with a different template is ended when it would be restored,
because the wallet would still run the old one.

## The session

`session.data` holds what the wallet approved:

| Field           | Description                                                                |
| --------------- | -------------------------------------------------------------------------- |
| `chain`         | `bitcoincash`, `bchtest` or `bchreg`, from the client's network.           |
| `walletPubkey`  | The wallet's key for this session. Random per pairing: not an account id.  |
| `template`      | The template the session was established with.                             |
| `allowedTokens` | The token categories the wallet granted.                                   |

Besides `executeAction`, a session answers two reads and sends one event:

```ts
const balances = await client.request(session, "getBalances", undefined);
const nfts = await client.request(session, "getTokens", undefined);

client.subscribe(session, "balancesChanged", ({ balances }) => {
	console.log(balances.sats);
});
```

`executeAction` has no deadline unless you pass `timeoutMs`, because the
person may need time to approve it in the wallet. The wallet reports declining and failing the same way, so a
rejected request never says who rejected it; the wallet's own text is in the
error's `remoteMessage`.

## Things to know

- The wallet derives the account it uses for your dapp from `appMetadata.url`.
  Keep that URL the exact same string across releases and environments: a
  different string is a different account in the wallet. Any dapp can claim
  any URL.
- Use one browser tab per dapp. Two tabs restore the same session and are not
  coordinated: a disconnect in one may be undone by the other.
- At the `debug` log level the SDK logs full request and response payloads.
- `regtest` maps to `bchreg`, which Cashonize does not accept.

## Requirements

- `@bchconnect/core`, and `@cashconnect-js/nostr` and `@cashconnect-js/core`
  at exactly `1.0.0-alpha.31`, as peer dependencies.
- A bundler target of ES2022 or later.
- TypeScript 5.9 or later, for typed usage.
- ESM and CommonJS builds are both included.

## License

[MIT](https://github.com/BCH-Connect/bchconnect/blob/main/LICENSE)
