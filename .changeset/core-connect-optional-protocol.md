---
"@bchconnect/core": minor
---

**Breaking** — The `protocol` parameter of `connect()` is optional on `Client` and `ClientLifecycle`, so a client no longer satisfies a structural type that declares `connect(protocol: string)` with a required protocol.

Migration: make `protocol` optional in your own copies of the `ClientLifecycle` shape, as in `connect(protocol?: string, opts?: ConnectOptions)`.
