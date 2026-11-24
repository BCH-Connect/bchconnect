import type { ProtocolId } from "@bchconnect/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONNECT, SIGN } from "../content";
import type { LiveClient } from "../lib/live-client";
import { liveConnectEnabled, loadClient } from "../lib/live-client";

export type ConnectStatus =
	| "disabled"
	| "idle"
	| "loading"
	| "open"
	| "connected"
	| "failed";

export type SignStatus =
	| "idle"
	| "signing"
	| "verified"
	| "mismatch"
	| "rejected"
	| "failed";

export interface LiveSession {
	readonly walletName: string;
	readonly walletLogo: string | undefined;
	readonly protocol: ProtocolId;
	readonly address: string;
	/** Whether the wallet approved message signing for this session. */
	readonly canSign: boolean;
}

type Session = NonNullable<LiveClient["current"]>;

function toLiveSession(client: LiveClient, session: Session): LiveSession {
	return {
		walletName: session.wallet.name ?? CONNECT.unnamedWallet,
		walletLogo: session.wallet.icon,
		protocol: session.protocol,
		address: session.data.addresses[0] ?? "",
		canSign: client.can(session, "message-signing"),
	};
}

/** What the wallet shows: plain, dated, and naming where it came from. */
function signText(): string {
	return `Signed with BCH Connect on bchconnect.dev\n${new Date().toISOString()}`;
}

/** Runs `task` when the browser is idle, or shortly after where it has no idle callback. */
function whenIdle(task: () => void): () => void {
	if ("requestIdleCallback" in window) {
		const handle = window.requestIdleCallback(task);
		return () => window.cancelIdleCallback(handle);
	}
	const timer = setTimeout(task, 1500);
	return () => clearTimeout(timer);
}

/**
 * The hero's connection: the button, the account and the signing request,
 * all following the real client's state.
 */
export function useLiveConnect() {
	const [status, setStatus] = useState<ConnectStatus>(
		liveConnectEnabled ? "idle" : "disabled",
	);
	const [session, setSession] = useState<LiveSession | null>(null);
	const [sign, setSign] = useState<SignStatus>("idle");
	/** The protocol a connection in progress runs over, when the client registers only one. */
	const [only, setOnly] = useState<ProtocolId | null>(null);
	const signing = useRef<AbortController | null>(null);
	/** The control that opened the modal, or the account that replaced it. */
	const controlRef = useRef<HTMLButtonElement>(null);
	const refocus = useRef(false);
	const unsubscribe = useRef<(() => void) | null>(null);

	/** Loads the client and mirrors its current session, including ends the wallet starts. */
	const attach = useCallback(async () => {
		const client = await loadClient();
		if (unsubscribe.current !== null) return client;
		const sync = () => {
			const current = client.current;
			setSession(current === null ? null : toLiveSession(client, current));
			setStatus((previous) =>
				current !== null
					? "connected"
					: previous === "connected"
						? "idle"
						: previous,
			);
			if (current === null) {
				signing.current?.abort();
				setSign("idle");
			}
		};
		setOnly(
			client.protocols.length === 1 ? (client.protocols[0] ?? null) : null,
		);
		unsubscribe.current = client.store.subscribe(sync);
		sync();
		return client;
	}, []);

	const open = useCallback(async () => {
		if (status !== "idle" && status !== "failed") return;
		setStatus("loading");
		try {
			const client = await attach();
			setStatus("open");
			await client.connect();
		} catch (error) {
			const { isBchConnectError } = await import("@bchconnect/core");
			setStatus(isBchConnectError(error, "ABORTED") ? "idle" : "failed");
		}
		refocus.current = true;
	}, [attach, status]);

	const disconnect = useCallback(async () => {
		refocus.current = true;
		const client = await loadClient();
		// The account stays until the store reports the session gone, so a failure leaves it in place.
		await client.disconnect().catch(() => {});
	}, []);

	/** Asks the wallet to sign, then checks the signature against the session's addresses. */
	const signMessage = useCallback(async () => {
		if (signing.current !== null) return;
		const controller = new AbortController();
		signing.current = controller;
		setSign("signing");
		const message = signText();
		try {
			const [client, { verifyMessage }] = await Promise.all([
				loadClient(),
				import("../lib/verify-message"),
			]);
			const current = client.current;
			if (current === null) {
				setSign("idle");
				return;
			}
			const { signMessage } = await import("@bchconnect/core");
			const signature = await signMessage(
				client,
				current,
				{ message, userPrompt: SIGN.prompt },
				{ signal: controller.signal },
			);
			setSign(
				verifyMessage(message, signature, current.data.addresses)
					? "verified"
					: "mismatch",
			);
		} catch (error) {
			const { isBchConnectError } = await import("@bchconnect/core");
			setSign(
				isBchConnectError(error, "ABORTED")
					? "idle"
					: isBchConnectError(error, "REJECTED")
						? "rejected"
						: "failed",
			);
		} finally {
			signing.current = null;
		}
	}, []);

	const cancelSign = useCallback(() => {
		signing.current?.abort();
	}, []);

	/** Starts loading early, so the click that follows finds the client ready. */
	const preload = useCallback(() => {
		if (liveConnectEnabled) void attach().catch(() => {});
	}, [attach]);

	// `init()` restores the previous visit's session; the sign client itself loads only if there is one.
	useEffect(
		() => (liveConnectEnabled ? whenIdle(preload) : undefined),
		[preload],
	);

	// The control swaps between the button and the account, so focus follows the one on screen.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs after each status change, by design.
	useEffect(() => {
		if (!refocus.current) return;
		refocus.current = false;
		controlRef.current?.focus();
	}, [status]);

	useEffect(
		() => () => {
			unsubscribe.current?.();
			signing.current?.abort();
		},
		[],
	);

	return {
		status,
		session,
		connectingOver: status === "open" ? only : null,
		open,
		disconnect,
		sign,
		signMessage,
		cancelSign,
		preload,
		controlRef,
	};
}
