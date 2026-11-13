# @bchconnect/core

## 0.1.0

### Minor Changes

- [#67](https://github.com/BCH-Connect/bchconnect/pull/67) [`c600b87`](https://github.com/BCH-Connect/bchconnect/commit/c600b87d7a719ee0cfa3cf78490233e81af83469) Thanks [@fran-dv](https://github.com/fran-dv)! - **Breaking** — The `protocol` parameter of `connect()` is optional on `Client` and `ClientLifecycle`, so a client no longer satisfies a structural type that declares `connect(protocol: string)` with a required protocol.
  
  Migration: make `protocol` optional in your own copies of the `ClientLifecycle` shape, as in `connect(protocol?: string, opts?: ConnectOptions)`.

- [#20](https://github.com/BCH-Connect/bchconnect/pull/20) [`febc435`](https://github.com/BCH-Connect/bchconnect/commit/febc435082b762e95cc6130cb7e4286c1579820b) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — Core type definitions, the `BchConnectError` base class and `isBchConnectError`.

- [#20](https://github.com/BCH-Connect/bchconnect/pull/20) [`febc435`](https://github.com/BCH-Connect/bchconnect/commit/febc435082b762e95cc6130cb7e4286c1579820b) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — The `BchConnectError` subclasses and the internal client store.

### Patch Changes

- [#51](https://github.com/BCH-Connect/bchconnect/pull/51) [`71d4c59`](https://github.com/BCH-Connect/bchconnect/commit/71d4c591c511326f90e2f2bb130283e1635b1d27) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `subscribe()` listens to a protocol event on a session; the subscription ends with the session or when the client is disposed.

- [#67](https://github.com/BCH-Connect/bchconnect/pull/67) [`c600b87`](https://github.com/BCH-Connect/bchconnect/commit/c600b87d7a719ee0cfa3cf78490233e81af83469) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `createClient()` takes an optional `ui`, a `ConnectUi` that handles every `connect()` call rendering no pairing of its own, so `client.connect()` can be called without a protocol and the user chooses one.

- [#59](https://github.com/BCH-Connect/bchconnect/pull/59) [`e8bc4b6`](https://github.com/BCH-Connect/bchconnect/commit/e8bc4b6a9985e301aafc10fe330b3988b61518fd) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `signTransaction()` and `signMessage()` sign through a session's capability on any protocol.

- [#67](https://github.com/BCH-Connect/bchconnect/pull/67) [`c600b87`](https://github.com/BCH-Connect/bchconnect/commit/c600b87d7a719ee0cfa3cf78490233e81af83469) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `connect()`'s `wallet` option also accepts a function, read when the session is established, so a wallet the user selects after the call started still names the session.

- [#25](https://github.com/BCH-Connect/bchconnect/pull/25) [`3ff2a4c`](https://github.com/BCH-Connect/bchconnect/commit/3ff2a4cbe2991fd831d31374c88c4be4cdd42084) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `createClient` with connection, disconnection, restoration and SSR reconciliation.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `cookieToInitialState()` reads the client snapshot from a request's cookie header, for a connected first render under `ssr`.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — `createClient` rejects a connector whose protocol id is `client`, which is reserved for the client's own storage keys.

- [#59](https://github.com/BCH-Connect/bchconnect/pull/59) [`e8bc4b6`](https://github.com/BCH-Connect/bchconnect/commit/e8bc4b6a9985e301aafc10fe330b3988b61518fd) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — Connectors can build a session's capabilities, and `capability()` and `can()` now answer for connected sessions.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `memory()` creates an in-memory key-value store to pass as the client's `storage`.

- [#58](https://github.com/BCH-Connect/bchconnect/pull/58) [`7b5dfcf`](https://github.com/BCH-Connect/bchconnect/commit/7b5dfcfd91dad10a4d19fd499de2f90a5cc5403c) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `stringifyExtendedJson()` and `parseExtendedJson()` write and read the extended JSON wallets use for `bigint` and `Uint8Array` values.

- [#46](https://github.com/BCH-Connect/bchconnect/pull/46) [`15dc3ad`](https://github.com/BCH-Connect/bchconnect/commit/15dc3ad2a3846de6d01fb68f36260fbb72dc0470) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `request()` sends a protocol method over a session with a correlation id, cancellation, pending state and the `request:*` events.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `cookieStorage()` keeps entries in cookies, so a server can read the client snapshot from the request.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Changed** — The client now persists to `localStorage()` by default, so sessions survive a page reload; connectors keep their state there even when `storage` is set.

- [#55](https://github.com/BCH-Connect/bchconnect/pull/55) [`2b599be`](https://github.com/BCH-Connect/bchconnect/commit/2b599be5b7565376805e347fd0129d5e7f8aef45) Thanks [@fran-dv](https://github.com/fran-dv)! - **Added** — `localStorage()` keeps entries in the browser's `localStorage`, or in memory where it is unavailable.
