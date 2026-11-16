import type { BchcRadius, WalletSupport } from "@bchconnect/ui";
import { ArrowRight, Monitor, Moon, Smartphone, Sun } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { FEATURES } from "../../content";
import type { StageLook } from "../../embed/stage-message";
import {
	STAGE_ACCENTS,
	STAGE_MESSAGE,
	STAGE_READY,
	STAGE_SIZE,
} from "../../embed/stage-message";
import { useInView } from "../../hooks/use-in-view";
import { useRoving } from "../../hooks/use-roving";
import { loadUi, siteMode } from "../../lib/modal-demo";
import { CodeWindow, f, k } from "./code-window";

export type InterfaceView = "builtIn" | "headless";

export const VIEWS: readonly InterfaceView[] = ["builtIn", "headless"];

/** Each radius preset, with the corner its button draws. */
const RADII: ReadonlyArray<readonly [BchcRadius, number]> = [
	["none", 0],
	["small", 3],
	["medium", 5],
	["large", 7],
	["full", 11],
];

type Device = "desktop" | "mobile";
const DEVICES: readonly Device[] = ["desktop", "mobile"];

/** The viewport the modal is given, before the stage scales it to fit. */
const SCREENS: Readonly<Record<Device, { width: number; height: number }>> = {
	desktop: { width: 820, height: 580 },
	mobile: { width: 390, height: 760 },
};

/** The space the modal keeps above its drawer (its card's max-height leaves `--bchc-space-10`). */
const DRAWER_GAP = 40;

/** The space the modal keeps around its card (its max-height leaves `--bchc-space-8`). */
const CARD_GAP = 32;

/** How long the screen takes to change shape; the modal is hidden until it has. */
const RESHAPE_MS = 460;

/** The screen area keeps one height for both devices, so switching never resizes the box. */
const SCREEN_MIN_HEIGHT = 460;
const SCREEN_MAX_HEIGHT = 620;
/** Room left around the desktop window inside the screen area. */
const SCREEN_GUTTER = 32;

interface InterfaceStageProps {
	readonly view: InterfaceView;
}

/**
 * The real modal on a screen of its own, desktop or phone, re-themed live by
 * the controls around it; or, headless, the same state driving an interface
 * of your own.
 */
export function InterfaceStage({ view }: InterfaceStageProps) {
	const stageRef = useRef<HTMLDivElement>(null);
	const screenRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<HTMLIFrameElement>(null);
	const near = useInView(stageRef, "400px");
	const [loaded, setLoaded] = useState(false);
	const [device, setDevice] = useState<Device>("desktop");
	const [look, setLook] = useState<StageLook>({
		accent: "violet",
		radius: "large",
		mode: "light",
	});
	const [src, setSrc] = useState<string | null>(null);
	const [width, setWidth] = useState(0);
	const [wallets, setWallets] = useState<readonly WalletSupport[]>([]);
	// The tallest drawer seen so far: the phone keeps that height, so moving between screens never rescales it.
	const [drawerHeight, setDrawerHeight] = useState<number | null>(null);
	// Likewise the tallest card, so no look ever leaves the desktop modal scrolling.
	const [cardHeight, setCardHeight] = useState<number | null>(null);
	const [reshaping, setReshaping] = useState(false);
	const shownDevice = useRef(device);

	const devices = useRoving(DEVICES, device, setDevice);
	const accents = useRoving(
		STAGE_ACCENTS.map(([id]) => id),
		look.accent,
		(accent) => setLook((current) => ({ ...current, accent })),
	);
	const radii = useRoving(
		RADII.map(([id]) => id),
		look.radius,
		(radius) => setLook((current) => ({ ...current, radius })),
	);

	// Starts in the site's mode, on a phone screen when read on a phone.
	useEffect(() => {
		setLook((current) => ({ ...current, mode: siteMode() }));
		if (window.matchMedia("(max-width: 639px)").matches) setDevice("mobile");
	}, []);

	// The frame loads once, when the stage comes near; later looks travel by message.
	useEffect(() => {
		if (!near || src !== null) return;
		const params = new URLSearchParams({
			accent: look.accent,
			radius: look.radius,
			mode: look.mode,
		});
		setSrc(`/embed/modal?${params}`);
	}, [near, src, look]);

	// Opening on load, the modal focuses itself, and Chrome scrolls the page to the focus.
	// That first focus is undone: the scroll goes back and the page keeps the keyboard.
	useEffect(() => {
		let y = window.scrollY;
		let frame = requestAnimationFrame(function sample() {
			y = window.scrollY;
			frame = requestAnimationFrame(sample);
		});
		const stop = () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("blur", onBlur);
		};
		const onBlur = () => {
			const held = y;
			requestAnimationFrame(() => {
				const iframe = frameRef.current;
				if (iframe === null || document.activeElement !== iframe) return;
				stop();
				iframe.blur();
				window.scrollTo({ top: held, behavior: "instant" });
			});
		};
		window.addEventListener("blur", onBlur);
		return stop;
	}, []);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as {
				type?: unknown;
				height?: unknown;
				sheet?: unknown;
			};
			if (data?.type === STAGE_READY) setLoaded(true);
			if (data?.type === STAGE_SIZE && typeof data.height === "number") {
				const height = data.height;
				const grow = (current: number | null) =>
					current === null ? height : Math.max(current, height);
				if (data.sheet === true) setDrawerHeight(grow);
				else setCardHeight(grow);
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	useEffect(() => {
		if (!loaded) return;
		frameRef.current?.contentWindow?.postMessage(
			{ type: STAGE_MESSAGE, ...look },
			window.location.origin,
		);
	}, [loaded, look]);

	// The frame's viewport jumps to the new device at once while the screen around it eases there.
	useEffect(() => {
		if (shownDevice.current === device) return;
		shownDevice.current = device;
		setReshaping(true);
		const timer = window.setTimeout(() => setReshaping(false), RESHAPE_MS);
		return () => window.clearTimeout(timer);
	}, [device]);

	useEffect(() => {
		const screen = screenRef.current;
		if (screen === null) return;
		const observer = new ResizeObserver(() => setWidth(screen.clientWidth));
		observer.observe(screen);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!near || wallets.length > 0) return;
		void loadUi()
			.then((mod) =>
				setWallets(
					mod.BCHC_WALLETS.filter((wallet) =>
						wallet.protocols.includes("bch-wc2"),
					).slice(0, 3),
				),
			)
			.catch(() => {});
	}, [near, wallets.length]);

	const desktop = {
		width: SCREENS.desktop.width,
		height: Math.max(
			SCREENS.desktop.height,
			Math.ceil((cardHeight ?? 0) + CARD_GAP),
		),
	};
	// A phone screen only as tall as the drawer plus the gap the drawer always keeps above itself.
	const screen =
		device === "desktop"
			? desktop
			: drawerHeight !== null
				? {
						width: SCREENS.mobile.width,
						height: Math.round(drawerHeight + DRAWER_GAP),
					}
				: SCREENS.mobile;
	const desktopScale =
		width > 0
			? Math.min(
					1,
					width / desktop.width,
					(SCREEN_MAX_HEIGHT - SCREEN_GUTTER) / desktop.height,
				)
			: 1;
	// A narrow box is read on a phone: give the area a phone's proportions so the drawer is not shrunk.
	const areaHeight = Math.min(
		SCREEN_MAX_HEIGHT,
		Math.max(
			SCREEN_MIN_HEIGHT,
			desktop.height * desktopScale + SCREEN_GUTTER,
			width > 0 && width < 520 ? width * 1.6 : 0,
		),
	);
	const scale =
		device === "desktop"
			? desktopScale
			: Math.min(1, areaHeight / screen.height, width / screen.width);
	const dark = look.mode === "dark";
	const settled =
		!reshaping &&
		(device === "desktop" ? cardHeight !== null : drawerHeight !== null);

	return (
		<div ref={stageRef} className="stage" data-view={view}>
			<div
				className="stage-view stage-built"
				data-shown={view === "builtIn"}
				inert={view !== "builtIn"}
			>
				<div className="stage-knobs">
					<div className="knob-group">
						<div
							role="tablist"
							aria-label="Screen"
							className="segmented segmented--icons"
							onKeyDown={devices.onKeyDown}
							style={
								{
									"--tabs": DEVICES.length,
									"--tab": DEVICES.indexOf(device),
								} as CSSProperties
							}
						>
							<span className="segmented-thumb" aria-hidden="true" />
							{DEVICES.map((id) => (
								<button
									key={id}
									{...devices.item(id)}
									role="tab"
									aria-selected={device === id}
									aria-controls="stage-screen"
									aria-label={id === "desktop" ? "Desktop" : "Mobile"}
									title={id === "desktop" ? "Desktop" : "Mobile"}
									className="segmented-option"
								>
									{id === "desktop" ? (
										<Monitor aria-hidden="true" />
									) : (
										<Smartphone aria-hidden="true" />
									)}
								</button>
							))}
						</div>
						<span className="knob-rule" aria-hidden="true" />
						<fieldset className="knob-swatches" onKeyDown={accents.onKeyDown}>
							<legend className="sr-only">{FEATURES.interface.accent}</legend>
							{STAGE_ACCENTS.map(([accent, colour]) => (
								<button
									key={accent}
									{...accents.item(accent)}
									aria-pressed={look.accent === accent}
									aria-label={accent}
									title={accent[0]?.toUpperCase() + accent.slice(1)}
									className="knob-swatch"
									style={{ "--swatch": colour } as CSSProperties}
								/>
							))}
						</fieldset>
					</div>
					<div className="knob-group">
						<fieldset className="knob-radii" onKeyDown={radii.onKeyDown}>
							<legend className="sr-only">{FEATURES.interface.radius}</legend>
							{RADII.map(([radius, r]) => (
								<button
									key={radius}
									{...radii.item(radius)}
									aria-pressed={look.radius === radius}
									aria-label={`${FEATURES.interface.radius} ${radius}`}
									className="knob-radius"
								>
									<svg viewBox="0 0 16 16" aria-hidden="true">
										<path
											d={`M3 13 V${3 + r} ${r > 0 ? `Q3 3 ${3 + r} 3` : ""} H13`}
										/>
									</svg>
								</button>
							))}
						</fieldset>
						<span className="knob-rule" aria-hidden="true" />
						<button
							type="button"
							className="stage-mode"
							aria-pressed={dark}
							aria-label={dark ? "Light modal" : "Dark modal"}
							title={dark ? "Light modal" : "Dark modal"}
							onClick={() =>
								setLook((current) => ({
									...current,
									mode: dark ? "light" : "dark",
								}))
							}
						>
							<Sun aria-hidden="true" className="stage-mode-sun" />
							<Moon aria-hidden="true" className="stage-mode-moon" />
						</button>
					</div>
				</div>

				<div
					ref={screenRef}
					id="stage-screen"
					role="tabpanel"
					className="stage-screen"
					style={{ height: areaHeight }}
				>
					<div
						className="stage-device"
						data-device={device}
						data-ready={loaded}
						style={
							{
								width: screen.width * scale,
								height: screen.height * scale,
								"--device-scale": scale,
							} as CSSProperties
						}
					>
						{src !== null && (
							<iframe
								ref={frameRef}
								src={src}
								title="Connect modal preview"
								className="stage-frame"
								data-settled={settled}
								// `zoom`, not `scale`: the frame then renders at its shown size, while a scaled frame is drawn at full size and resampled, which blurs the modal's text.
								style={{
									width: screen.width,
									height: screen.height,
									zoom: scale,
								}}
							/>
						)}
					</div>
				</div>
			</div>

			<div
				className="stage-view stage-headless"
				data-shown={view === "headless"}
				inert={view !== "headless"}
			>
				<HeadlessDemo wallets={wallets} />
			</div>
		</div>
	);
}

type Phase = "idle" | "pending" | "done";

const COINS = [0, 1, 2, 3, 4] as const;

function Coin({ index }: { readonly index: number }) {
	return (
		<svg
			className="yours-coin"
			aria-hidden="true"
			viewBox="0 0 24 24"
			style={{ "--i": index } as CSSProperties}
		>
			<circle cx="12" cy="12" r="11" fill="#0ac18e" />
			<circle
				cx="12"
				cy="12"
				r="8.6"
				fill="none"
				stroke="#ffffff59"
				strokeWidth="1.2"
			/>
			<g
				transform="rotate(-14 12 12)"
				fill="none"
				stroke="#ffffff"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M9.4 7.4h3.4a2.2 2.2 0 0 1 0 4.4H9.4zM9.4 11.8h4a2.4 2.4 0 0 1 0 4.8h-4zM9.4 7.4v9.2M11 5.6v1.8M11 16.6v1.8" />
			</g>
		</svg>
	);
}

/**
 * A wallet picker a dapp writes itself, in a brand that is not the
 * library's, drawn from the views `headlessModal()` hands it. Picking a wallet
 * walks it through pending to connected, then it rests again.
 */
function HeadlessDemo({
	wallets,
}: {
	readonly wallets: readonly WalletSupport[];
}) {
	const [phase, setPhase] = useState<Phase>("idle");
	const [picked, setPicked] = useState<string | null>(null);
	const [aiming, setAiming] = useState(false);
	const timers = useRef<number[]>([]);

	useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

	const pick = (id: string) => {
		timers.current.forEach(window.clearTimeout);
		setPicked(id);
		setPhase("pending");
		timers.current = [
			window.setTimeout(() => setPhase("done"), 1400),
			window.setTimeout(() => {
				setPhase("idle");
				setPicked(null);
			}, 3200),
		];
	};

	const status =
		phase === "pending"
			? FEATURES.interface.yoursPending
			: phase === "done"
				? FEATURES.interface.yoursDone
				: FEATURES.interface.yoursIdle;

	return (
		<>
			<CodeWindow file="client.ts" className="headless-code">
				{k("const")} client = {f("createClient")}({"{\n  "}
				...config,{"\n  "}
				ui: {f("headlessModal")}({"{\n    "}
				<span className="headless-prop" data-on={aiming && phase === "idle"}>
					{f("open")}: (view, actions) {k("=>")}
					{"\n      "}
					picker.{f("show")}(view, actions),
				</span>
				{"\n    "}
				<span className="headless-prop" data-on={phase === "pending"}>
					{f("update")}: (view) {k("=>")} picker.{f("render")}(view),
				</span>
				{"\n    "}
				{f("close")}: {k("async")} () {k("=>")} picker.{f("hide")}(),
				{"\n  }),\n});"}
			</CodeWindow>

			{/* The component the code renders, laid over the window's corner it comes out of. */}
			<div className="yours-card" data-phase={phase}>
				<div className="yours-band" aria-hidden="true">
					<span className="yours-brand">{FEATURES.interface.yoursBrand}</span>
					<span className="yours-coins">
						{COINS.map((index) => (
							<Coin key={index} index={index} />
						))}
					</span>
				</div>
				<p className="yours-title">{FEATURES.interface.yoursTitle}</p>
				<ul className="yours-list">
					{wallets.map((wallet) => (
						<li key={wallet.id}>
							<button
								type="button"
								className="yours-row"
								data-picked={picked === wallet.id}
								disabled={phase !== "idle"}
								onClick={() => pick(wallet.id)}
								onPointerEnter={() => setAiming(true)}
								onPointerLeave={() => setAiming(false)}
								onFocus={() => setAiming(true)}
								onBlur={() => setAiming(false)}
							>
								<img src={wallet.logo} alt="" width={22} height={22} />
								{wallet.name}
								<ArrowRight aria-hidden="true" className="yours-chevron" />
							</button>
						</li>
					))}
				</ul>
				<p className="yours-status" aria-live="polite">
					<span className="yours-pulse" aria-hidden="true" />
					{status}
				</p>
			</div>
			<p className="yours-note">{FEATURES.interface.yoursNote}</p>
		</>
	);
}
