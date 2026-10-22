# @bchconnect/ui

## 0.1.0

### Patch Changes

- [#40](https://github.com/BCH-Connect/bchconnect/pull/40) [`c466aae`](https://github.com/BCH-Connect/bchconnect/commit/c466aaedfd632c8d51eb2a628cb20c90b5416ae8) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — A Custom Elements Manifest, published as `custom-elements.json` and referenced from `customElements` in `package.json`.

- [#48](https://github.com/BCH-Connect/bchconnect/pull/48) [`7d86ecd`](https://github.com/BCH-Connect/bchconnect/commit/7d86ecd26f11e2398d52dd1b36e9ebdb7b69e24b) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `<bchc-modal>` and `<bchc-toast>` render with Lit, which becomes a dependency.

- [#39](https://github.com/BCH-Connect/bchconnect/pull/39) [`09797d3`](https://github.com/BCH-Connect/bchconnect/commit/09797d37aa1cc6ce8d6da6f73ad3949c46566790) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — The `@bchconnect/ui` package: the connect modal and success toast as custom elements, with the curated theme system and default wallet and protocol data.

- [#48](https://github.com/BCH-Connect/bchconnect/pull/48) [`7d86ecd`](https://github.com/BCH-Connect/bchconnect/commit/7d86ecd26f11e2398d52dd1b36e9ebdb7b69e24b) Thanks [@fran-dv](https://github.com/fran-dv)! - **Fixed** — The connect code redraws on pages that enforce Trusted Types.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `BCHC_WALLETS` lists WizardConnect for Selene.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — Cashonize in `BCHC_WALLETS` ships a desktop link that opens the web wallet with the connection link.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `WalletOption.href` and the new, required `WalletSupport.href` are desktop links, shown on the selected wallet with `{link}` replaced by the connection link.

- [#53](https://github.com/BCH-Connect/bchconnect/pull/53) [`99f2bca`](https://github.com/BCH-Connect/bchconnect/commit/99f2bca55941d0d5bc712b4da143c128e1583e54) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — A wallet directory entry's link `label` is optional; without it the modal shows the catalogue's `getWallet(name)`.

- [#66](https://github.com/BCH-Connect/bchconnect/pull/66) [`2f8991b`](https://github.com/BCH-Connect/bchconnect/commit/2f8991b898261331ea6fb68f8c56373dee9cb4ba) Thanks [@fran-dv](https://github.com/fran-dv)! - **Fixed** — The "Didn't open?" hint no longer stays on screen after the session type changes; it clears with the link it was about.

- [#53](https://github.com/BCH-Connect/bchconnect/pull/53) [`99f2bca`](https://github.com/BCH-Connect/bchconnect/commit/99f2bca55941d0d5bc712b4da143c128e1583e54) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — A `messages` property on `<bchc-modal>` and `<bchc-toast>` that overrides or translates their strings, typed by the exported `BchcMessages` catalogue with English as `BCHC_MESSAGES_EN`.

- [#57](https://github.com/BCH-Connect/bchconnect/pull/57) [`243bad9`](https://github.com/BCH-Connect/bchconnect/commit/243bad9f9e6754bc89cb2b5ff28d4dbe73c637a8) Thanks [@fran-dv](https://github.com/fran-dv)! - **Fixed** — `<bchc-modal>` shows again and closes normally when `view` is set to `null` and then to a new view after a close.

- [#56](https://github.com/BCH-Connect/bchconnect/pull/56) [`87304e9`](https://github.com/BCH-Connect/bchconnect/commit/87304e9d34f8023d6ba66307b3ca8a0c911b2fe6) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `<bchc-modal>` is a native modal dialog: the page behind is inert and does not scroll, and focus returns to the opener on close.

- [#53](https://github.com/BCH-Connect/bchconnect/pull/53) [`99f2bca`](https://github.com/BCH-Connect/bchconnect/commit/99f2bca55941d0d5bc712b4da143c128e1583e54) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — A built-in Spanish locale, `BCHC_MESSAGES_ES`, imported from `@bchconnect/ui/locales/es`.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `<bchc-modal>` fires `bchc-wallet` when the visitor selects a wallet, and before `bchc-protocol` when a tab change pins the default wallet; `bchc-protocol` follows when the selected wallet lacks the current session type.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `<bchc-modal>` leads with wallets on a wide viewport: a wallet is always selected and narrows the session-type tabs that replace the dropdown.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `BchcMessages` requires `scanWith`, `open` and `openWalletLabel`, for the scan caption and the desktop link.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `WalletOption` requires `protocols`, the session types the wallet speaks.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `ModalView` requires `wallet`, the id of the selected wallet.

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — The `walletsHeading` message reads "Choose your wallet" (Spanish: "Elige tu billetera").

- [#60](https://github.com/BCH-Connect/bchconnect/pull/60) [`ecf5302`](https://github.com/BCH-Connect/bchconnect/commit/ecf5302f1dcb2b1daca49074e56908420053a620) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `ModalView.wallets` lists every wallet that speaks an enabled session type, not only the current one.
