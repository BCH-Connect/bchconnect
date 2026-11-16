---
"@bchconnect/ui": patch
---

**Fixed** — The modal no longer passes the wallet's logo to the client, so a session saved with `cookieStorage()` stays under the 4096-byte cookie limit.
