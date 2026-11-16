![Three connection protocols, WizardConnect, WalletConnect and CashConnect, lead into one Connect wallet button that opens the BCH Connect modal](.github/assets/banner.jpg)

# BCH Connect

BCH Connect is a wallet-connection library for Bitcoin Cash dapps. One
TypeScript API connects your dapp to wallets across connection protocols,
with a built-in modal you can ship as it is or replace with your own UI.

> BCH Connect is in alpha and not yet stable. Expect breaking changes.

- **Any connection protocol, through one client.**.
- **Built-in modal, or your own UI.** A beautiful built-in modal and toast
  that work out of the box, or plug your own UI.
- **Themable and localized.** Eight accents, light and dark modes, and
  presets for radius and font. Every string can be overridden, with English
  and Spanish locales built in.
- **Typed from end to end.**
- **Sessions that last.** Sessions restore on the next visit, and a dapp can
  hold more than one at a time.
- **Framework-agnostic, with support for SSR.** Built in plain TypeScript with
  bindings for frameworks like React.
- **Lightweight, with minimal dependencies.** The core has no runtime
  dependencies, and protocol SDKs load lazily.

## Documentation

To get started, read the docs at [bchconnect.dev](https://bchconnect.dev).

## Packages

| Package                                                                   | What it is                                 |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| [`@bchconnect/core`](packages/core)                                       | The client: sessions, requests and errors. |
| [`@bchconnect/connector-walletconnect`](packages/connector-walletconnect) | The WalletConnect connector.               |
| [`@bchconnect/ui`](packages/ui)                                           | The connect modal and success toast.       |

Connectors for WizardConnect and CashConnect are planned.

## License

[MIT](LICENSE)
