# @bchconnect/core

## 0.1.0

### Minor Changes

- [#20](https://github.com/BCH-Connect/bchconnect/pull/20) [`febc435`](https://github.com/BCH-Connect/bchconnect/commit/febc435082b762e95cc6130cb7e4286c1579820b) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — Core type definitions, the `BchConnectError` base class and `isBchConnectError`.

- [#20](https://github.com/BCH-Connect/bchconnect/pull/20) [`febc435`](https://github.com/BCH-Connect/bchconnect/commit/febc435082b762e95cc6130cb7e4286c1579820b) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — The `BchConnectError` subclasses and the internal client store.

### Patch Changes

- [#51](https://github.com/BCH-Connect/bchconnect/pull/51) [`71d4c59`](https://github.com/BCH-Connect/bchconnect/commit/71d4c591c511326f90e2f2bb130283e1635b1d27) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `subscribe()` listens to a protocol event on a session; the subscription ends with the session or when the client is disposed.

- [#25](https://github.com/BCH-Connect/bchconnect/pull/25) [`3ff2a4c`](https://github.com/BCH-Connect/bchconnect/commit/3ff2a4cbe2991fd831d31374c88c4be4cdd42084) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `createClient` with connection, disconnection, restoration and SSR reconciliation.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `cookieToInitialState()` reads the client snapshot from a request's cookie header, for a connected first render under `ssr`.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `createClient` rejects a connector whose protocol id is `client`, which is reserved for the client's own storage keys.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `memory()` creates an in-memory key-value store to pass as the client's `storage`.

- [#46](https://github.com/BCH-Connect/bchconnect/pull/46) [`15dc3ad`](https://github.com/BCH-Connect/bchconnect/commit/15dc3ad2a3846de6d01fb68f36260fbb72dc0470) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `request()` sends a protocol method over a session with a correlation id, cancellation, pending state and the `request:*` events.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `cookieStorage()` keeps entries in cookies, so a server can read the client snapshot from the request.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — The client now persists to `localStorage()` by default, so sessions survive a page reload; connectors keep their state there even when `storage` is set.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `localStorage()` keeps entries in the browser's `localStorage`, or in memory where it is unavailable.
