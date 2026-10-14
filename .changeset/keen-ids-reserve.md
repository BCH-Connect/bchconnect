---
"@bchconnect/core": patch
---

**Changed** — `createClient` rejects a connector whose protocol id is `client`, which is reserved for the client's own storage keys.
