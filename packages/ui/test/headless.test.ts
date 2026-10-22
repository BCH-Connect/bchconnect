import {
	AbortedError,
	type ConnectOptions,
	type ConnectUiContext,
	RequestRejectedError,
	type Session,
	TimeoutError,
} from "@bchconnect/core";
import { describe, expect, it } from "vitest";
import { BCHC_DIRECTORY, BCHC_WALLETS } from "../src/defaults.ts";
import {
	headlessModal,
	type ModalActions,
	type ModalRenderer,
} from "../src/headless.ts";
import type { ModalView } from "../src/state.ts";

interface ScriptedAttempt {
	readonly protocol: string;
	readonly opts: ConnectOptions;
	resolve(session: Session): void;
	reject(error: unknown): void;
}

// A client context whose attempts settle when the test says so.
function scriptedContext(overrides: Partial<ConnectUiContext> = {}) {
	const attempts: ScriptedAttempt[] = [];
	const controller = new AbortController();
	const context: ConnectUiContext = {
		protocols: ["wizardconnect", "bch-wc2", "cashconnect"],
		protocol: null,
		network: "mainnet",
		signal: controller.signal,
		connect(protocol, opts = {}) {
			return new Promise((resolve, reject) => {
				attempts.push({ protocol, opts, resolve, reject });
				opts.signal?.addEventListener("abort", () =>
					reject(new AbortedError("Aborted by the modal")),
				);
			});
		},
		...overrides,
	};
	return { context, attempts, abort: () => controller.abort() };
}

function scriptedRenderer() {
	const calls: string[] = [];
	const views: ModalView[] = [];
	let actions: ModalActions | undefined;
	const renderer: ModalRenderer = {
		open(view, given) {
			calls.push("open");
			views.push(view);
			actions = given;
		},
		update(view) {
			calls.push("update");
			views.push(view);
		},
		async close() {
			calls.push("close");
		},
	};
	return {
		renderer,
		calls,
		views,
		last: () => views.at(-1),
		actions: () => {
			if (actions === undefined) throw new Error("The modal never opened");
			return actions;
		},
	};
}

// Lets queued attempts start.
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

const pairing = { kind: "uri", uri: "wc:pairing" } as const;

function walletSession(wallet: Session["wallet"]): Session {
	return {
		id: "s1",
		protocol: "wizardconnect",
		wallet,
		data: {},
		status: { transport: "connected", peer: "reachable" },
	};
}

describe("headlessModal", () => {
	it("should open on the first enabled protocol with the wallets that speak one", async () => {
		const { context, attempts } = scriptedContext({
			protocols: ["bch-wc2", "demo"],
			network: "chipnet",
		});
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();

		expect(modal.calls[0]).toBe("open");
		expect(modal.views[0]).toEqual({
			screen: "connect",
			protocol: "bch-wc2",
			protocols: [expect.objectContaining({ id: "bch-wc2" })],
			wallets: BCHC_WALLETS,
			wallet: null,
			directory: BCHC_DIRECTORY,
			network: "chipnet",
			phase: { kind: "initiating" },
		});
		expect(attempts.map((attempt) => attempt.protocol)).toEqual(["bch-wc2"]);
	});

	it("should follow the configured protocol order", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer, {
			protocols: ["cashconnect", "wizardconnect"],
		}).connect(context);
		await settle();

		expect(modal.views[0]?.protocols.map((entry) => entry.id)).toEqual([
			"cashconnect",
			"wizardconnect",
		]);
		expect(attempts[0]?.protocol).toBe("cashconnect");
	});

	it("should offer only the locked protocol", async () => {
		const { context, attempts } = scriptedContext({ protocol: "cashconnect" });
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();

		expect(modal.views[0]?.protocols.map((entry) => entry.id)).toEqual([
			"cashconnect",
		]);
		expect(modal.views[0]?.wallets.map((wallet) => wallet.id)).toEqual([
			"cashonize",
			"optn",
		]);
		expect(attempts[0]?.protocol).toBe("cashconnect");
	});

	it("should reject CONFIG without opening when no enabled protocol can be shown", async () => {
		const { context } = scriptedContext({ protocols: ["demo"] });
		const modal = scriptedRenderer();

		await expect(
			headlessModal(modal.renderer).connect(context),
		).rejects.toMatchObject({ code: "CONFIG" });
		expect(modal.calls).toEqual([]);
	});

	it("should show the link once the attempt has pairing material", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();
		attempts[0]?.opts.onPairing?.(pairing);

		expect(modal.last()?.phase).toEqual({
			kind: "awaiting-approval",
			link: "wc:pairing",
		});
	});

	it("should show the connected phase, close, then resolve with the session", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();
		const session = walletSession({
			name: "Cashonize",
			icon: "logo.svg",
			source: "protocol",
		});

		const call = headlessModal(modal.renderer).connect(context);
		await settle();
		attempts[0]?.resolve(session);

		await expect(call).resolves.toBe(session);
		expect(modal.calls.slice(-2)).toEqual(["update", "close"]);
		expect(modal.last()?.phase).toEqual({
			kind: "connected",
			walletName: "Cashonize",
			walletLogo: "logo.svg",
		});
	});

	it("should show a listed wallet's own logo once connected", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		const call = headlessModal(modal.renderer).connect(context);
		await settle();
		attempts[0]?.resolve(
			walletSession({
				id: "paytaca",
				icon: "https://example.com/wire.png",
				source: "protocol",
			}),
		);
		await call;

		expect(modal.last()?.phase).toEqual({
			kind: "connected",
			walletName: "Paytaca",
			walletLogo: BCHC_WALLETS.find((entry) => entry.id === "paytaca")?.logo,
		});
	});

	it("should show the failure by reason and start again on retry", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();
		attempts[0]?.reject(new RequestRejectedError("No", { by: "user" }));
		await settle();

		expect(modal.last()?.phase).toEqual({ kind: "failed", reason: "rejected" });

		modal.actions().retry();
		await settle();

		expect(attempts.map((attempt) => attempt.protocol)).toEqual([
			"wizardconnect",
			"wizardconnect",
		]);
		expect(modal.last()?.phase).toEqual({ kind: "initiating" });
	});

	it("should map each error code to its failure reason", async () => {
		const cases = [
			[new TimeoutError("Late"), "timeout"],
			[new AbortedError("Stopped"), "aborted"],
			[new Error("Unknown"), "transport"],
		] as const;
		for (const [error, reason] of cases) {
			const { context, attempts } = scriptedContext();
			const modal = scriptedRenderer();
			void headlessModal(modal.renderer).connect(context);
			await settle();
			attempts[0]?.reject(error);
			await settle();

			expect(modal.last()?.phase).toEqual({ kind: "failed", reason });
		}
	});

	it("should abort the current attempt and connect over the protocol picked", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();
		attempts[0]?.opts.onPairing?.(pairing);
		modal.actions().selectProtocol("cashconnect");
		await settle();

		expect(attempts[0]?.opts.signal?.aborted).toBe(true);
		expect(attempts[1]?.protocol).toBe("cashconnect");
		expect(modal.last()).toMatchObject({
			protocol: "cashconnect",
			phase: { kind: "initiating" },
		});
	});

	it("should ignore a protocol that is not enabled", async () => {
		const { context, attempts } = scriptedContext({
			protocols: ["wizardconnect"],
		});
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();
		modal.actions().selectProtocol("cashconnect");
		await settle();

		expect(attempts).toHaveLength(1);
	});

	it("should ignore pairing material from an attempt it aborted", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();
		modal.actions().selectProtocol("bch-wc2");
		await settle();
		attempts[0]?.opts.onPairing?.(pairing);

		expect(modal.last()?.phase).toEqual({ kind: "initiating" });
	});

	it("should switch to the first protocol a selected wallet speaks", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer, {
			protocols: ["cashconnect", "bch-wc2"],
		}).connect(context);
		await settle();
		modal.actions().selectWallet("paytaca");
		await settle();

		expect(modal.last()).toMatchObject({
			wallet: "paytaca",
			protocol: "bch-wc2",
		});
		expect(attempts.map((attempt) => attempt.protocol)).toEqual([
			"cashconnect",
			"bch-wc2",
		]);
	});

	it("should keep the attempt when the selected wallet speaks its protocol", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();
		modal.actions().selectWallet("selene");
		await settle();

		expect(modal.last()?.wallet).toBe("selene");
		expect(attempts).toHaveLength(1);
	});

	it("should name the session after the wallet selected while the attempt runs", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();
		const wallet = attempts[0]?.opts.wallet;
		const read = () => (typeof wallet === "function" ? wallet() : wallet);

		expect(read()).toBeUndefined();
		modal.actions().selectWallet("optn");

		expect(read()).toEqual({
			id: "optn",
			name: "OPTN",
			icon: BCHC_WALLETS.find((entry) => entry.id === "optn")?.logo,
		});
	});

	it("should move between screens", async () => {
		const { context } = scriptedContext();
		const modal = scriptedRenderer();

		void headlessModal(modal.renderer).connect(context);
		await settle();
		modal.actions().showScreen("wallets");

		expect(modal.last()?.screen).toBe("wallets");
	});

	it("should abort, close and reject ABORTED when the person dismisses it", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		const call = headlessModal(modal.renderer).connect(context);
		await settle();
		modal.actions().dismiss();

		await expect(call).rejects.toMatchObject({ code: "ABORTED" });
		expect(attempts[0]?.opts.signal?.aborted).toBe(true);
		expect(modal.calls.at(-1)).toBe("close");
		expect(modal.last()?.phase).toEqual({ kind: "initiating" });
	});

	it("should close and reject ABORTED when the client aborts the call", async () => {
		const { context, abort } = scriptedContext();
		const modal = scriptedRenderer();

		const call = headlessModal(modal.renderer).connect(context);
		await settle();
		abort();

		await expect(call).rejects.toMatchObject({ code: "ABORTED" });
		expect(modal.calls.at(-1)).toBe("close");
	});

	it("should ignore actions once the call has ended", async () => {
		const { context, attempts } = scriptedContext();
		const modal = scriptedRenderer();

		const call = headlessModal(modal.renderer).connect(context);
		await settle();
		modal.actions().dismiss();
		await call.catch(() => {});
		const seen = modal.calls.length;
		modal.actions().selectProtocol("cashconnect");
		modal.actions().retry();
		await settle();

		expect(attempts).toHaveLength(1);
		expect(modal.calls).toHaveLength(seen);
	});
});
