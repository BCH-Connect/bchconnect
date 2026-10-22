---
"@bchconnect/ui": minor
---

**Breaking** — The WalletConnect session type's `ProtocolId` is `"bch-wc2"`, the id its connector registers in `@bchconnect/core`, instead of `"walletconnect"`; its display name is still "WalletConnect".

Migration: replace `"walletconnect"` with `"bch-wc2"` in `view.protocol`, wallet `protocols` lists and `bchc-protocol` handlers.
