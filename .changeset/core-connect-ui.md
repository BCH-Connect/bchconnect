---
"@bchconnect/core": patch
---

**Added** — `createClient()` takes an optional `ui`, a `ConnectUi` that handles every `connect()` call rendering no pairing of its own, so `client.connect()` can be called without a protocol and the user chooses one.
