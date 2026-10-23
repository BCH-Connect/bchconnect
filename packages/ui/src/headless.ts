import {
	AbortedError,
	ConfigError,
	type ConnectUi,
	type ConnectUiContext,
	isBchConnectError,
	type Pairing,
	type Session,
	type WalletSelection,
} from "@bchconnect/core";
import { BCHC_DIRECTORY, BCHC_PROTOCOLS, BCHC_WALLETS } from "./defaults.ts";
import type {
	ConnectPhase,
	FailureReason,
	ModalScreen,
	ModalView,
	ProtocolId,
	ProtocolOption,
	WalletOption,
} from "./state.ts";

/**
 * What the person did in the modal, reported by a {@link ModalRenderer}.
 *
 * @beta
 */
export interface ModalActions {
	/** The person selected a wallet, by id. */
	selectWallet(wallet: string): void;
	/** The person picked a session type. */
	selectProtocol(protocol: ProtocolId): void;
	/** The person moved between the connect and wallets screens. */
	showScreen(screen: ModalScreen): void;
	/** The person pressed Try again after a failure. */
	retry(): void;
	/** The person dismissed the modal: close button, Escape, backdrop or drag. */
	dismiss(): void;
}

/**
 * Draws the modal for {@link headlessModal}. It keeps no connection state:
 * it draws each view and reports what the person does.
 *
 * @beta
 */
export interface ModalRenderer {
	/** Shows the modal with its first view. */
	open(view: ModalView, actions: ModalActions): void;
	/** Replaces the view, each time with a new object. */
	update(view: ModalView): void;
	/** Plays the exit and removes the modal; resolves once it is gone. */
	close(): Promise<void>;
	/**
	 * Whether the person can see the wallet list now. When `false`, the
	 * selection is not reported as the session's wallet. Defaults to `true`.
	 */
	showsWallets?(): boolean;
}

/**
 * The protocol and wallet a {@link headlessModal} opens on.
 *
 * @beta
 */
export interface ModalDefaults {
	/** The initial protocol. Defaults to the first enabled one the default wallet speaks. */
	protocol?: ProtocolId;
	/** The initially selected wallet, by id. Defaults to the first listed wallet that speaks the initial protocol. */
	wallet?: string;
}

/**
 * Options for {@link headlessModal}.
 *
 * @beta
 */
export interface HeadlessModalOptions {
	/** Wallets to list. Defaults to the curated wallets that speak an enabled protocol. */
	wallets?: readonly WalletOption[];
	/** Session type order. */
	protocols?: readonly ProtocolId[];
	/**
	 * What the modal opens on. An explicit protocol wins over a wallet that
	 * lacks it; a default that is not enabled or not listed falls back.
	 */
	defaults?: ModalDefaults;
}

function reasonOf(error: unknown): FailureReason {
	if (!isBchConnectError(error)) return "transport";
	switch (error.code) {
		case "REJECTED":
			return "rejected";
		case "TIMEOUT":
			return "timeout";
		case "ABORTED":
			return "aborted";
		case "NETWORK_MISMATCH":
			return "network-mismatch";
		default:
			return "transport";
	}
}

function isProtocolId(id: string): id is ProtocolId {
	return BCHC_PROTOCOLS.some((entry) => entry.id === id);
}

function enabledProtocols(
	context: ConnectUiContext,
	order: readonly ProtocolId[],
): readonly ProtocolOption[] {
	const offered = context.protocols.filter(isProtocolId);
	return order
		.filter(
			(id) =>
				offered.includes(id) &&
				(context.protocol === null || id === context.protocol),
		)
		.flatMap((id) => BCHC_PROTOCOLS.filter((entry) => entry.id === id));
}

function selectionOf(wallet: WalletOption): WalletSelection {
	const selection: WalletSelection = { id: wallet.id, name: wallet.name };
	if (wallet.logo !== null) selection.icon = wallet.logo;
	return selection;
}

interface Attempt {
	readonly controller: AbortController;
	settled: Promise<void>;
}

function run(
	renderer: ModalRenderer,
	options: HeadlessModalOptions,
	context: ConnectUiContext,
): Promise<Session> {
	const protocols = enabledProtocols(
		context,
		options.protocols ?? BCHC_PROTOCOLS.map((entry) => entry.id),
	);
	const enabled = protocols.map((entry) => entry.id);
	const wallets = (options.wallets ?? BCHC_WALLETS).filter((wallet) =>
		wallet.protocols.some((id) => enabled.includes(id)),
	);
	const preferred = wallets.find(
		(entry) => entry.id === options.defaults?.wallet,
	);
	const initial =
		enabled.find((id) => id === options.defaults?.protocol) ??
		enabled.find((id) => preferred?.protocols.includes(id)) ??
		enabled[0];
	if (initial === undefined) {
		return Promise.reject(
			new ConfigError("No enabled protocol has a session type the modal shows"),
		);
	}
	const walletFor = (protocol: ProtocolId, current?: WalletOption) =>
		current?.protocols.includes(protocol)
			? current.id
			: (wallets.find((entry) => entry.protocols.includes(protocol))?.id ??
				null);

	return new Promise<Session>((resolve, reject) => {
		let view: ModalView = {
			screen: "connect",
			protocol: initial,
			protocols,
			wallets,
			wallet: walletFor(initial, preferred),
			directory: BCHC_DIRECTORY,
			network: context.network,
			phase: { kind: "initiating" },
		};
		let attempt: Attempt | null = null;
		// Attempts start one after another, so a switch back never finds its protocol still pending.
		let queue = Promise.resolve();
		let done = false;

		function update(patch: Partial<ModalView>) {
			view = { ...view, ...patch };
			renderer.update(view);
		}

		function selected(): WalletSelection | undefined {
			if (renderer.showsWallets?.() === false) return undefined;
			const wallet = wallets.find((entry) => entry.id === view.wallet);
			return wallet === undefined ? undefined : selectionOf(wallet);
		}

		// Each start bumps this, so a start superseded while it waited is skipped.
		let wanted = 0;

		async function begin(protocol: ProtocolId, generation: number) {
			const previous = attempt;
			previous?.controller.abort();
			await previous?.settled;
			if (done || generation !== wanted) return;

			const controller = new AbortController();
			const current: Attempt = { controller, settled: Promise.resolve() };
			attempt = current;
			const isCurrent = () => attempt === current && !done;
			const connecting = context.connect(protocol, {
				signal: controller.signal,
				onPairing(pairing: Pairing) {
					if (isCurrent() && pairing.kind === "uri") {
						update({ phase: { kind: "awaiting-approval", link: pairing.uri } });
					}
				},
				wallet: selected,
			});
			current.settled = connecting.then(
				() => {},
				() => {},
			);
			connecting.then(
				(session) => {
					if (isCurrent()) void succeed(session);
				},
				(error: unknown) => {
					if (isCurrent() && !controller.signal.aborted) {
						update({ phase: { kind: "failed", reason: reasonOf(error) } });
					}
				},
			);
		}

		// The view switches at once; the attempt follows once the previous one settles.
		function start(protocol: ProtocolId) {
			wanted += 1;
			const generation = wanted;
			if (view.protocol !== protocol || view.phase.kind !== "initiating") {
				const current = wallets.find((entry) => entry.id === view.wallet);
				update({
					protocol,
					wallet: walletFor(protocol, current),
					phase: { kind: "initiating" },
				});
			}
			queue = queue.then(() => begin(protocol, generation));
		}

		async function succeed(session: Session) {
			done = true;
			// A listed wallet is shown with its bundled logo, not the one on the wire.
			const listed = wallets.find((entry) => entry.id === session.wallet.id);
			const phase: ConnectPhase = {
				kind: "connected",
				walletName: session.wallet.name ?? listed?.name ?? null,
				walletLogo: listed?.logo ?? session.wallet.icon ?? null,
			};
			update({ phase });
			await renderer.close().catch(() => {});
			resolve(session);
		}

		async function end(reason: unknown) {
			if (done) return;
			done = true;
			attempt?.controller.abort();
			await renderer.close().catch(() => {});
			reject(reason);
		}

		const actions: ModalActions = {
			selectWallet(id) {
				const wallet = wallets.find((entry) => entry.id === id);
				if (done || wallet === undefined || id === view.wallet) return;
				update({ wallet: id });
				if (wallet.protocols.includes(view.protocol)) return;
				const fallback = enabled.find((entry) =>
					wallet.protocols.includes(entry),
				);
				if (fallback !== undefined) start(fallback);
			},
			selectProtocol(protocol) {
				if (done || protocol === view.protocol || !enabled.includes(protocol))
					return;
				start(protocol);
			},
			showScreen(screen) {
				if (!done && screen !== view.screen) update({ screen });
			},
			retry() {
				if (!done && view.phase.kind === "failed") start(view.protocol);
			},
			dismiss() {
				void end(new AbortedError("The person closed the connection modal"));
			},
		};

		if (context.signal.aborted) {
			reject(new AbortedError("The connection was aborted"));
			return;
		}
		context.signal.addEventListener(
			"abort",
			() => void end(new AbortedError("The connection was aborted")),
			{ once: true },
		);
		renderer.open(view, actions);
		start(initial);
	});
}

/**
 * The modal's connection logic as a `ConnectUi`, drawn by any renderer. Pass
 * the result as the client's `ui`.
 *
 * @example
 * ```ts
 * import { createClient } from "@bchconnect/core";
 * import { headlessModal } from "@bchconnect/ui/headless";
 *
 * const client = createClient({
 *   connectors,
 *   network: "mainnet",
 *   appMetadata,
 *   ui: headlessModal({
 *     open(view, actions) { myModal.show(view, actions); },
 *     update(view) { myModal.render(view); },
 *     close() { return myModal.hide(); },
 *   }),
 * });
 * await client.init();
 * const session = await client.connect();
 * ```
 *
 * @beta
 */
export function headlessModal(
	renderer: ModalRenderer,
	options: HeadlessModalOptions = {},
): ConnectUi {
	return {
		connect(context) {
			return run(renderer, options, context);
		},
	};
}
