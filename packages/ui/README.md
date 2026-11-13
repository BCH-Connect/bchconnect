# @bchconnect/ui

The connect modal and success toast of
[BCH Connect](https://github.com/BCH-Connect/bchconnect), a wallet-connection
library for Bitcoin Cash dapps. They are custom elements that work with vanilla JS/TS or any framework.

> This package is in alpha and not yet stable. Expect breaking changes.

## Install

**With BCH Connect** (most dapps): the built-in modal, plugged into the client.

```sh
npm install @bchconnect/core @bchconnect/connector-wizardconnect @bchconnect/ui
```

One line in `createClient()` turns it on: `ui: bchconnectModal()`. See [Usage](#usage).

**Standalone**: `<bchc-modal>` and `<bchc-toast>` without BCH Connect core package, driven
by your own code. See [Standalone use](#standalone-use).

```sh
npm install @bchconnect/ui
```

`@bchconnect/core` is an optional peer dependency. Only `@bchconnect/ui/modal`
and `@bchconnect/ui/headless` need it, so your dapp and the modal share one
client. If you import those entries without `@bchconnect/core`, your bundler
will report the missing import at build time.

**Recommended font**: the modal is designed with
[Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans). The
package doesn't ship it, so install it alongside to get the intended look:

```sh
npm install @fontsource-variable/plus-jakarta-sans
```

Then set it up in two steps:

1. Import the package once in your app's entry file, such as `main.ts`:

   ```ts
   import "@fontsource-variable/plus-jakarta-sans";
   ```

2. In your global stylesheet, tell the modal to use it:

   ```css
   :root {
   	--bchc-font-brand-family: "Plus Jakarta Sans Variable";
   }
   ```

Without it, text falls back to the system font. To use another font, see
[Fonts](#fonts).

## Usage

Pass the built-in modal as the client's `ui`, then call `connect()`.
The modal lists wallets, shows the QR code or wallet link, and closes
with a success toast once the wallet connects.

```ts
import { createClient } from "@bchconnect/core";
import { wizardConnect } from "@bchconnect/connector-wizardconnect";
import { bchconnectModal } from "@bchconnect/ui/modal";

const client = createClient({
	connectors: [wizardConnect()],
	network: "mainnet",
	appMetadata: { name: "My example dapp", url: "https://example.com" },
	ui: bchconnectModal(),
});

await client.init();
const session = await client.connect();
```

The element code, Lit and the QR library load on the first `connect()`, so
creating the client costs almost nothing up front and is safe on a server.

Pass an options object to configure the modal. Each option is optional and
falls back to a sensible default:

```ts
import { BCHC_WALLETS } from "@bchconnect/ui";
import { bchconnectModal } from "@bchconnect/ui/modal";

bchconnectModal({
	// Which wallets to list, in order. Defaults to the built-in list.
	wallets: BCHC_WALLETS.filter((wallet) => wallet.id !== "optn"),
	// Protocol tabs order.
	protocols: ["wizardconnect", "bch-wc2"],
	// What are the options selected by default.
	defaults: { wallet: "selene", protocol: "wizardconnect" },
	// Reword any string, merged over English.
	messages: { connectTitle: "Sign in with a wallet" },
	// Tune the modal and the toast.
	theme: { accent: "blue", mode: "dark" },
	// `false` skips the success toast; a duration sets how long it stays, in ms.
	toast: { duration: 4000 },
});
```

## Theming

The modal and the toast are built to be restyled. Pick an accent, a neutral
family, a corner radius, a font, a backdrop blur and a colour scheme, and the
whole palette follows, in light and dark:

```ts
bchconnectModal({
	theme: {
		accent: "violet",
		radius: "large",
		font: "system",
		blur: "small",
		mode: "auto",
	},
});
```

| Option    | Values                                                                               |
| --------- | ------------------------------------------------------------------------------------ |
| `accent`  | `green` (default), `cyan`, `blue`, `violet`, `pink`, `red`, `amber`, `ink`           |
| `neutral` | `sage`, `slate`, `sand`, `pure`. Defaults to the one paired with the selected accent |
| `radius`  | `none`, `small`, `medium`, `large`, `full`                                           |
| `font`    | `brand`, `system`, `mono`                                                            |
| `blur`    | `none`, `small`, `large`                                                             |
| `mode`    | `auto` (follows the system), `light`, `dark`                                         |

Set only the options you want to change; the rest keep their defaults. Each
accent comes paired with a neutral family, so leave `neutral` unset to keep the
pairing and set it only to mix families on purpose.

When you create the elements yourself, set the same options as `data-bchc-*`
attributes on the element: `data-bchc-accent`, `data-bchc-neutral`,
`data-bchc-radius`, `data-bchc-font`, `data-bchc-blur` and `data-bchc-mode`.

### Fonts

Any font works the way Plus Jakarta Sans does in [Install](#install): load it on
your page and set `--bchc-font-brand-family` to its family name. The variable
reaches the elements' shadow roots through inheritance, but a `@font-face` rule
inside a shadow root doesn't apply, so the font must be loaded on the page
itself.

## Choosing a ui for BCH Connect

`createClient()` from `@bchconnect/core` takes a `ui` option: an object whose
`connect(ctx)` method runs when your dapp calls `client.connect()` without
passing a protocol. Without `ui`, `connect()` needs an explicit protocol.

| `ui`                        | Rendering                                                                                          | Connection flow logic |
| --------------------------- | -------------------------------------------------------------------------------------------------- | --------------------- |
| `bchconnectModal()`         | Built-in modal                                                                                     | Built-in              |
| `headlessModal(myRenderer)` | Your own modal, as an object with `open`, `update` and `close` ([Headless modal](#headless-modal)) | Built-in              |
| `{ connect(ctx) { … } }`    | Your code                                                                                          | Your code             |

```ts
import { bchconnectModal } from "@bchconnect/ui/modal";
import { headlessModal } from "@bchconnect/ui/headless";

createClient({ /* … */ ui: bchconnectModal() });
createClient({ /* … */ ui: headlessModal(myRenderer) });
createClient({
	/* … */ ui: {
		async connect(ctx) {
			/* … */
		},
	},
});
```

The connection flow lists wallets, starts the chosen protocol, and handles
retries, timeouts and cancellation until a session is returned. To write it
yourself, implement `connect(ctx)`:

```ts
const client = createClient({
	// …
	ui: {
		async connect(ctx) {
			// A protocol passed to client.connect() is the only one allowed.
			const protocol =
				ctx.protocol ?? (await myProtocolPicker(ctx.protocols, ctx.signal));
			return ctx.connect(protocol, { onPairing: showMyQrCode });
		},
	},
});
```

## Translations

Every string comes from a typed catalogue. Pass a built-in locale, or a partial
catalogue merged over English:

```ts
import { bchconnectModal } from "@bchconnect/ui/modal";
import { BCHC_MESSAGES_ES } from "@bchconnect/ui/locales/es";

bchconnectModal({ messages: BCHC_MESSAGES_ES });
bchconnectModal({ messages: { connectTitle: "Sign in with a wallet" } });
```

## Headless modal

To draw the modal yourself, keep its logic and supply a renderer.
`headlessModal()` runs the connection and hands your renderer a view to draw;
the renderer reports back what the person does.

```ts
import { headlessModal } from "@bchconnect/ui/headless";

const ui = headlessModal({
	open(view, actions) {
		myModal.show(view, actions);
	},
	update(view) {
		myModal.render(view);
	},
	close() {
		return myModal.hide();
	},
});
```

The `@bchconnect/ui/headless` entry carries no element code.

## Standalone use

`<bchc-modal>` and `<bchc-toast>` can also be used on their own, without
`@bchconnect/core`: register them with `defineElements()`, set `view`, and
listen for `bchc-*` events. Your code then drives the connection. Import the
package in the click handler to load it only when needed:

```ts
button.addEventListener("click", async () => {
	const { defineElements } = await import("@bchconnect/ui");
	defineElements();
	const modal = document.createElement("bchc-modal");
	// set modal.view and listen for bchc-* events
	document.body.append(modal);
});
```

## Requirements

- A browser with custom elements and shadow DOM. The package is ESM only.
- A page that enforces Trusted Types must allow the `lit-html` policy in its
  `trusted-types` directive.

## License

[MIT](https://github.com/BCH-Connect/bchconnect/blob/main/LICENSE)
