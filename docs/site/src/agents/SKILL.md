---
name: bchconnect
description: Adds Bitcoin Cash (BCH) wallet connection to a web app with BCH Connect, or creates a new BCH dapp with it. Use when the user wants a "connect wallet" button for Bitcoin Cash, wants to connect BCH wallets over WalletConnect, WizardConnect or CashConnect, or is working with @bchconnect/* packages.
license: MIT
---

# Set up BCH Connect

BCH Connect is a wallet-connection library for Bitcoin Cash dapps: one client,
one connector package per connection protocol, and a built-in connect modal.

It is young and its API changes between releases, so your training data is
likely out of date. Prefer the current docs over memory:

- Docs index: https://bchconnect.dev/llms.txt
- Any docs page as Markdown: add `.md` to its URL, for example
  `https://bchconnect.dev/docs/<page>.md`.
- Full docs in one file: https://bchconnect.dev/llms-full.txt (large).

When the docs and this guide disagree, follow the docs.

Work through the steps in order. Each step ends where the next begins.

## 1. Look before asking

Find out as much as you can from the project itself:

- **Is there a project?** Look for `package.json` in the working directory. If
  there is none, or the directory is empty, this is a **new project**: you
  will create one in step 3. Otherwise it is an **existing project**.
- **Framework and rendering.** Read `package.json` and the config files
  (`vite.config.*`, `next.config.*`, `nuxt.config.*`, `svelte.config.*`,
  `astro.config.*` and so on). Note whether pages render on the server.
- **Package manager.** Use the one the lockfile shows (`pnpm-lock.yaml`,
  `yarn.lock`, `bun.lock`, `package-lock.json`). Never mix them.
- **Existing wallet code.** If `@bchconnect/*` is already installed, extend
  that setup; do not create a second client. If another wallet-connection
  library is in use, stop and propose a migration plan before changing it.
- **Secrets.** Never read, print or commit `.env` files or other secret files.
  You may add new variable names to an example file such as `.env.example`.

## 2. Ask only what you could not find out

Ask these in one message, with your proposed default for each, and wait for
the answer:

- **New project only: framework.** Default: Vite with React and TypeScript.
- **Network.** `mainnet` or `chipnet` (the BCH test network). Default:
  `chipnet` while developing, if the dapp doesn't already pick one.
- **Protocols.** Which connection protocols to support. Default: every one
  that has a published connector (see step 4).
- **WalletConnect project ID**, if WalletConnect is among the protocols. It
  comes from https://dashboard.walletconnect.com. If the user has none yet,
  continue with a placeholder and list it as a to-do at the end.
- **The dapp's name and URL**, for the metadata wallets show, unless
  `package.json` or the project already says.

Then show a short checklist of the changes you will make, and continue once
the user agrees.

## 3. New project only: create it

Create the app with the framework's official scaffolding command (for
example `npm create vite@latest`), non-interactively, in the current directory
or a new folder the user names. Install its dependencies and confirm it starts
before adding anything else.

## 4. Install the packages

Always install:

- `@bchconnect/core`, the client.
- `@bchconnect/ui`, the built-in connect modal.

Then one connector package per protocol, named
`@bchconnect/connector-<protocol>`. Check that each one is published before
installing it, with `npm view <package> version`, and use only the ones that
exist. Do not guess package names or write a connector yourself. If a
protocol the user wants has no package yet, say so and leave it out.

- WalletConnect: `@bchconnect/connector-walletconnect`, which also needs its
  peer dependency `@walletconnect/sign-client` at version 2.21.8 or later.

Pin exact versions (`--save-exact`, `-E`), because breaking changes can land
in any release before 1.0.

## 5. Create one client

Create the client once, in its own module (for example `src/bchconnect.ts`),
and import it wherever it is needed. Never create it inside a component
render.

```ts
import { createClient } from "@bchconnect/core";
import { walletConnect } from "@bchconnect/connector-walletconnect";
import { bchconnectModal } from "@bchconnect/ui/modal";

export const client = createClient({
	connectors: [
		walletConnect({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID }),
	],
	network: "chipnet",
	appMetadata: { name: "My dapp", url: "https://example.com" },
	ui: bchconnectModal(),
});
```

- Read the project ID from an environment variable with the framework's
  public prefix (`VITE_`, `NEXT_PUBLIC_`, `PUBLIC_` and so on). It is public,
  not a secret, but it belongs in configuration, not in code.
- Call `await client.init()` once, in the browser, when the app starts. It
  restores the sessions from the previous visit.
- Use the built-in modal from `@bchconnect/ui/modal` unless the user asks for
  their own interface. For a custom modal that keeps the built-in connection
  flow, use `headlessModal()` from `@bchconnect/ui/headless`; see the docs.
- **Server rendering:** create the client with `ssr: true` and
  `storage: cookieStorage(cookieHeader)` (`cookieStorage` comes from
  `@bchconnect/core`). On the server, create one client per request from the
  request's `Cookie` header, and pass
  `cookieToInitialState(client, cookieHeader)` to the browser as
  `initialState`. In the browser, call `cookieStorage()` without arguments.
  Never share one client across server requests.

## 6. Add the connect button

Add a "Connect wallet" button where the user asks, or in the app's header.

- On click, call `client.connect()`. With the built-in modal, the modal lets
  the person pick a wallet and protocol, and returns the session.
- Show the connected address from `session.data.addresses[0]`, and a
  disconnect action that calls `client.disconnect(session)`.
- To re-render on changes, subscribe to the client: `client.subscribe()` and
  `client.getState()` work with React's `useSyncExternalStore`. The current
  session is `getState().sessions.get(getState().currentSessionId)`.
- Handle a rejected `connect()` (for example, the person closed the modal)
  without showing an error.

## 7. Check your work

- Run the project's own type check, linter and build, as its scripts define
  them. Fix every error you introduced.
- Start the dev server, open the page and confirm the button opens the
  modal. If you can drive a browser, check it there; otherwise ask the user
  to click it and tell you what they see.
- Report anything you could not check, rather than claiming it works.

## 8. Leave notes for later sessions

Add a short "BCH Connect" section to the project's agent instructions file
(`AGENTS.md`, or `CLAUDE.md` if that is what the project uses; create
`AGENTS.md` if neither exists) with:

- the installed `@bchconnect/*` versions;
- where the client lives;
- a note to read https://bchconnect.dev/llms.txt and the `.md` docs pages
  before changing wallet code, instead of relying on memory.

## 9. Finish

Tell the user, briefly:

- what you changed, file by file;
- what they still need to do, such as setting the real WalletConnect project
  ID or testing with a real wallet;
- what to read next in the docs, for example signing messages and
  transactions with `signMessage` and `signTransaction`.
