import type { BchcAccent, BchcModal, BchcRadius } from "@bchconnect/ui";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UiModule } from "../lib/modal-demo";
import { driveShowcase, loadUi } from "../lib/modal-demo";
import type { StageLook } from "./stage-message";
import {
	isStageMessage,
	STAGE_ACCENTS,
	STAGE_READY,
	STAGE_SIZE,
} from "./stage-message";
import "./modal-embed.css";

function initialLook(): StageLook {
	const params = new URLSearchParams(window.location.search);
	return {
		accent: (params.get("accent") as BchcAccent | null) ?? "violet",
		radius: (params.get("radius") as BchcRadius | null) ?? "large",
		mode: params.get("mode") === "dark" ? "dark" : "light",
	};
}

/**
 * The connect modal on its own page, for the features section to frame.
 * Its own viewport lets the modal pick card or drawer for real, and keeps
 * its document-wide keyboard handling away from the landing. Closing it
 * leaves a button that opens it again.
 */
export function ModalEmbed() {
	const look = useRef<StageLook | null>(null);
	const modRef = useRef<UiModule | null>(null);
	const modalRef = useRef<BchcModal | null>(null);
	const repaint = useRef<(() => void) | null>(null);
	const [open, setOpen] = useState(true);
	const [mode, setMode] = useState<"dark" | "light">("light");
	const [accent, setAccent] = useState<BchcAccent>("violet");

	/**
	 * Reports the height the card needs to show everything: its own height
	 * plus whatever its scrolling body hides. Once the screen grows to that,
	 * the body stops overflowing and the report holds steady.
	 */
	const reportSize = useCallback((modal: BchcModal) => {
		const post = () => {
			const card = modal.shadowRoot?.querySelector<HTMLElement>(".card");
			if (!card || !modal.isConnected) return;
			const body = card.querySelector<HTMLElement>(".body");
			const hidden = body
				? Math.max(0, body.scrollHeight - body.clientHeight)
				: 0;
			const sheet =
				modal.shadowRoot?.querySelector(".overlay.is-sheet") !== null;
			window.parent.postMessage(
				{ type: STAGE_SIZE, height: card.offsetHeight + hidden, sheet },
				window.location.origin,
			);
		};
		const observer = new ResizeObserver(post);
		const watch = () => {
			const card = modal.shadowRoot?.querySelector(".card");
			if (card) {
				observer.observe(card);
				const body = card.querySelector(".body");
				if (body) observer.observe(body);
			} else requestAnimationFrame(watch);
		};
		watch();
		// A new screen can bring a new body; watch whichever one is there now.
		modal.addEventListener("bchc-screen", () =>
			requestAnimationFrame(() => {
				observer.disconnect();
				watch();
			}),
		);
		modal.addEventListener("bchc-close", () => observer.disconnect(), {
			once: true,
		});
	}, []);

	const mount = useCallback(() => {
		const mod = modRef.current;
		if (mod === null || modalRef.current !== null || look.current === null)
			return;
		const modal = document.createElement("bchc-modal");
		modal.addEventListener("bchc-close", () => {
			modal.remove();
			modalRef.current = null;
			repaint.current = null;
			setOpen(false);
		});
		modalRef.current = modal;
		document.body.append(modal);
		repaint.current = driveShowcase(
			mod,
			modal,
			() => look.current ?? { accent: "violet" },
		);
		reportSize(modal);
		setOpen(true);
	}, [reportSize]);

	useEffect(() => {
		look.current = initialLook();
		setMode(look.current.mode);
		setAccent(look.current.accent);
		let cancelled = false;
		void loadUi().then((mod) => {
			if (cancelled) return;
			mod.defineElements();
			modRef.current = mod;
			mount();
		});
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			if (!isStageMessage(event.data)) return;
			const { accent, radius, mode: next } = event.data;
			look.current = { accent, radius, mode: next };
			setMode(next);
			setAccent(accent);
			repaint.current?.();
		};
		window.addEventListener("message", onMessage);
		window.parent.postMessage({ type: STAGE_READY }, window.location.origin);
		return () => {
			cancelled = true;
			window.removeEventListener("message", onMessage);
			modalRef.current?.remove();
		};
	}, [mount]);

	return (
		<main
			className="modal-embed"
			data-mode={mode}
			style={
				{
					"--embed-accent": STAGE_ACCENTS.find(([id]) => id === accent)?.[1],
				} as CSSProperties
			}
		>
			{!open && (
				<button type="button" className="modal-embed-open" onClick={mount}>
					Open the modal
				</button>
			)}
		</main>
	);
}
