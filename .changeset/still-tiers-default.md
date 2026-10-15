---
"@bchconnect/core": patch
---

**Changed** — The client now persists to `localStorage()` by default, so sessions survive a page reload; connectors keep their state there even when `storage` is set.
