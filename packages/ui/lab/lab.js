/**
 * The lab harness.
 *
 * Drives the real component through every state, including the failures that
 * are near-impossible to reach on demand against a real wallet. Nothing here
 * ships: the harness is throwaway, the component it mounts is not.
 */

import {
	BCHC_DIRECTORY,
	BCHC_PROTOCOLS,
	BCHC_WALLETS,
} from "../src/defaults.ts";
import { register } from "../src/register.ts";
import {
	BCHC_ACCENT_DEFAULT_NEUTRAL,
	BCHC_ACCENTS,
	BCHC_BLURS,
	BCHC_FONTS,
	BCHC_NEUTRALS,
	BCHC_RADII,
} from "../src/theme.generated.ts";

// UMD global, handed in rather than imported: qr-code-styling ships no ESM
// entry, and the component is not allowed to reach for a global itself. The
// script tag that sets it runs before this module, so it is already there.
register(globalThis.QRCodeStyling);

/**
 * Where to actually get each wallet, official sites only for now. Kept apart
 * from `BCHC_DIRECTORY`, which carries the same sites under labelled links
 * rather than one href per wallet id — the shape this lab's "connected" and
 * wallet-list wiring wants.
 */
const WALLET_HREF = {
	cashonize: "https://cashonize.com",
	selene: "https://selene.cash",
	paytaca: "https://paytaca.com",
	optn: "https://optn.cash",
};

/**
 * Sample connection codes, one per protocol, for the "scan" state.
 *
 * Real WalletConnect and CashConnect sessions, sampled once; WizardConnect's
 * is fabricated in the same shape, since its code is live the moment the
 * modal opens rather than read back from a session.
 */
const PROTOCOL_LINKS = {
	wizardconnect:
		"WIZ://%3FP%3DLDT6EGH3WX8C47LZ4XFZ0EUFHUWVPMZPVHJEX4PP3ZMHD63SQFNQ%26S%3DQK7G6VT7GMDTV",
	walletconnect:
		"wc:f351dbe7d12d683faad485fd648e4c1e8db60bf14258129bbe5aab111c2ba4a0@2?expiryTimestamp=1790141761&relay-protocol=irn&symKey=b20098400b519b8bcf583df011d74fad8b0020817d518a2e035b406acc00bc96",
	// Sampled from a real session: a pairing key and the nostr relay.
	cashconnect:
		"bch-cc-v1:f40b68af88ef5de4f1a0a52a405d50e079bd7a6a36db7723b879650e5fc01c7d?relay=wss%3A%2F%2Fnostr.infra.cash",
};

/** `BCHC_WALLETS`, filtered to `protocolId` and shaped as a modal wants its `wallets` view field. */
function walletsFor(protocolId) {
	return BCHC_WALLETS.filter((wallet) => wallet.protocols.includes(protocolId)).map(
		(wallet) => ({
			id: wallet.id,
			name: wallet.name,
			logo: wallet.logo,
			href: WALLET_HREF[wallet.id] ?? null,
		}),
	);
}

const STATES = [
	["scan", "Scan"],
	["initiating", "Getting link"],
	["connected", "Connected"],
	["rejected", "Declined"],
	["timeout", "Timed out"],
	["aborted", "Stopped"],
	["transport", "Offline"],
	["network-mismatch", "Wrong network"],
	["unsupported", "Unsupported"],
];

const FAILURES = new Set([
	"rejected",
	"timeout",
	"aborted",
	"transport",
	"network-mismatch",
	"unsupported",
]);

const state = {
	open: false,
	screen: "connect",
	protocol: "wizardconnect",
	network: "mainnet",
	phase: "scan",
	theme: {
		accent: "green",
		neutral: "",
		radius: "large",
		font: "brand",
		face: "plus-jakarta",
		blur: "small",
		mode: "auto",
	},
};

const $ = (id) => document.getElementById(id);
let modal = null;

function fill(select, values, selected) {
	select.innerHTML = values
		.map(
			(value) =>
				`<option value="${value}"${value === selected ? " selected" : ""}>${value || "auto"}</option>`,
		)
		.join("");
}

function phaseFor() {
	if (FAILURES.has(state.phase)) return { kind: "failed", reason: state.phase };
	if (state.phase === "connected") {
		const wallet = BCHC_WALLETS.find((entry) => entry.id === "cashonize");
		return {
			kind: "connected",
			walletName: wallet.name,
			walletLogo: wallet.logo,
		};
	}
	if (state.phase === "initiating") return { kind: "initiating" };
	return { kind: "awaiting-approval", link: PROTOCOL_LINKS[state.protocol] };
}

function viewFor() {
	return {
		screen: state.screen,
		protocol: state.protocol,
		protocols: BCHC_PROTOCOLS,
		wallets: walletsFor(state.protocol),
		directory: BCHC_DIRECTORY,
		network: state.network,
		phase: phaseFor(),
	};
}

/**
 * Candidate brand faces, loaded from Google Fonts for the lab only. The
 * shipped library will carry one OFL face of its own; this is how it gets
 * chosen. "system" is the fallback stack every dapp gets without it.
 */
const FACES = {
	system: null,
	figtree: "Figtree",
	inter: "Inter",
	geist: "Geist",
	manrope: "Manrope",
	"plus-jakarta": "Plus Jakarta Sans",
	"dm-sans": "DM Sans",
	onest: "Onest",
	outfit: "Outfit",
};

const loadedFaces = new Set();

function loadFace(family) {
	if (family === null || loadedFaces.has(family)) return;
	loadedFaces.add(family);
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
	document.head.append(link);
}

function applyFace(element) {
	const family = FACES[state.theme.face] ?? null;
	loadFace(family);
	// The brand slot is a document-level custom property; setting it on the
	// host is exactly what a dapp that injects a face would do.
	if (family === null) element.style.removeProperty("--bchc-font-brand-family");
	else element.style.setProperty("--bchc-font-brand-family", `"${family}"`);
}

function applyTheme(element) {
	applyFace(element);
	const { accent, neutral, radius, font, blur, mode } = state.theme;
	element.dataset.bchcAccent = accent;
	// "auto" means the neutral the accent was designed against. CSS cannot
	// resolve this — nothing can select on a custom property's value — so the
	// caller setting the attributes does it, which is what the shipped library
	// will do too.
	element.dataset.bchcNeutral = neutral || BCHC_ACCENT_DEFAULT_NEUTRAL[accent];
	element.dataset.bchcRadius = radius;
	element.dataset.bchcFont = font;
	element.dataset.bchcBlur = blur;
	element.dataset.bchcMode = mode;
}

function open() {
	if (modal !== null) return;
	modal = document.createElement("bchc-modal");
	applyTheme(modal);
	modal.view = viewFor();

	// Fired once the exit has played; removing on it cuts nothing short.
	modal.addEventListener("bchc-close", close);
	modal.addEventListener("bchc-screen", (event) => {
		state.screen = event.detail.screen;
		refresh();
	});
	modal.addEventListener("bchc-retry", () => setPhase("scan"));
	modal.addEventListener("bchc-protocol", (event) => {
		state.protocol = event.detail.protocol;
		// A new protocol is a new attempt. WalletConnect's link comes from a
		// relay, so it cannot be shown at once; the others open straight onto a
		// live code.
		setPhase(state.protocol === "walletconnect" ? "initiating" : "scan");
	});

	document.body.append(modal);
	state.open = true;
}

/**
 * What a dapp does on success: the modal has closed itself, and something
 * quieter says who answered. Here that is the shipped toast.
 */
function celebrate() {
	const wallet = BCHC_WALLETS.find((entry) => entry.id === "cashonize");
	const toast = document.createElement("bchc-toast");
	applyTheme(toast);
	toast.view = {
		walletName: wallet.name,
		walletLogo: wallet.logo,
	};
	toast.addEventListener("bchc-dismiss", () => toast.remove());
	document.body.append(toast);
}

function close() {
	const succeeded = state.phase === "connected";
	modal?.remove();
	modal = null;
	state.open = false;
	if (succeeded) {
		celebrate();
		state.phase = "scan";
		for (const button of $("states").children) {
			button.setAttribute("aria-pressed", String(button.dataset.phase === "scan"));
		}
	}
	// A reopened modal starts where a first-time visitor would, not wherever
	// the last session happened to stop.
	state.screen = "connect";
}

function refresh() {
	if (modal === null) return;
	applyTheme(modal);
	modal.view = viewFor();
}

/** A stand-in for the relay: the link "arrives" this long after it is asked for. */
const RELAY_DELAY = 1500;
let relayTimer = null;

function setPhase(phase) {
	state.phase = phase;
	if (relayTimer !== null) clearTimeout(relayTimer);
	relayTimer =
		phase === "initiating"
			? setTimeout(() => {
					relayTimer = null;
					if (state.open && state.phase === "initiating") setPhase("scan");
				}, RELAY_DELAY)
			: null;
	for (const button of $("states").children) {
		button.setAttribute("aria-pressed", String(button.dataset.phase === phase));
	}
	refresh();
}

fill($("accent"), BCHC_ACCENTS, state.theme.accent);
fill($("neutral"), ["", ...BCHC_NEUTRALS], state.theme.neutral);
fill($("radius"), BCHC_RADII, state.theme.radius);
fill($("font"), BCHC_FONTS, state.theme.font);
fill($("face"), Object.keys(FACES), state.theme.face);
fill($("blur"), BCHC_BLURS, state.theme.blur);
fill($("mode"), ["auto", "light", "dark"], state.theme.mode);
fill($("network"), ["mainnet", "chipnet", "regtest"], state.network);

for (const key of [
	"accent",
	"neutral",
	"radius",
	"font",
	"face",
	"blur",
	"mode",
]) {
	$(key).addEventListener("change", (event) => {
		state.theme[key] = event.target.value;
		refresh();
	});
}

$("network").addEventListener("change", (event) => {
	state.network = event.target.value;
	refresh();
});

$("states").innerHTML = STATES.map(
	([phase, label]) =>
		`<button type="button" data-phase="${phase}" aria-pressed="${phase === state.phase}">${label}</button>`,
).join("");

for (const button of $("states").children) {
	button.addEventListener("click", () => {
		if (!state.open) open();
		setPhase(button.dataset.phase);
	});
}

$("connect").addEventListener("click", open);

// Clean mode, for recording: the panel and the fake dapp's chrome go, leaving
// the button alone on the page. `H` toggles it; `?clean` opens in it.
function setClean(on) {
	document.body.classList.toggle("clean", on);
	const url = new URL(location.href);
	if (on) url.searchParams.set("clean", "");
	else url.searchParams.delete("clean");
	history.replaceState(null, "", url);
}
setClean(new URLSearchParams(location.search).has("clean"));
document.addEventListener("keydown", (event) => {
	if (event.key.toLowerCase() !== "h" || event.metaKey || event.ctrlKey) return;
	if (event.target instanceof HTMLSelectElement) return;
	setClean(!document.body.classList.contains("clean"));
});
$("clean").addEventListener("click", () => setClean(true));
$("connect-stage").addEventListener("click", open);

/**
 * The floating knobs, for tuning on camera with the modal open. Each is a
 * second control for the panel's state. Swatch colours are each accent's
 * solid step, copied from `theme.generated.css`; the lab chrome does not
 * load the theme itself.
 */
const SWATCHES = {
	green: "#08c18e",
	cyan: "#00b2d1",
	blue: "#427ff7",
	violet: "#9259ea",
	pink: "#e253ae",
	red: "#e83f41",
	amber: "#e49900",
	ink: "#808080",
};

function pressed(group, value) {
	for (const button of group.children) {
		button.setAttribute("aria-pressed", String(button.dataset.value === value));
	}
}

$("swatches").innerHTML = BCHC_ACCENTS.map(
	(accent) =>
		`<button type="button" data-value="${accent}" title="${accent}" aria-label="${accent}" style="--swatch:${SWATCHES[accent]}"></button>`,
).join("");
$("radii").innerHTML = BCHC_RADII.map(
	(radius) => `<button type="button" data-value="${radius}">${radius}</button>`,
).join("");
pressed($("swatches"), state.theme.accent);
pressed($("radii"), state.theme.radius);

for (const [groupId, key] of [
	["swatches", "accent"],
	["radii", "radius"],
]) {
	$(groupId).addEventListener("click", (event) => {
		const button = event.target.closest("button");
		if (!button) return;
		state.theme[key] = button.dataset.value;
		$(key).value = button.dataset.value;
		pressed($(groupId), button.dataset.value);
		refresh();
	});
	$(key).addEventListener("change", (event) => {
		pressed($(groupId), event.target.value);
	});
}

// The one outcome worth showing on camera: the wallet declines, and the
// modal answers in place. "Try again" in the modal brings the code back.
$("float-decline").addEventListener("click", () => {
	if (!state.open) open();
	setPhase("rejected");
});

// The other outcome: the wallet approves. The modal closes itself and the
// lab mounts the toast, exactly as a dapp would.
$("float-connect").addEventListener("click", () => {
	if (!state.open) open();
	setPhase("connected");
});

// The stage's light/dark switch drives the same `mode` knob as the panel, and
// the page itself follows, so the whole recording changes scheme together.
function setScheme(mode) {
	state.theme.mode = mode;
	$("mode").value = mode;
	document.documentElement.style.colorScheme = mode === "auto" ? "" : mode;
	for (const button of document.querySelectorAll(".scheme button")) {
		button.setAttribute("aria-pressed", String(button.dataset.scheme === mode));
	}
	refresh();
}
for (const button of document.querySelectorAll(".scheme button")) {
	button.addEventListener("click", () => setScheme(button.dataset.scheme));
}
$("mode").addEventListener("change", (event) => setScheme(event.target.value));
setScheme(
	state.theme.mode === "auto"
		? matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light"
		: state.theme.mode,
);

// Escape is the modal's own business: it plays its exit and then emits
// `bchc-close`, which is the same path the cross and the scrim take.

// The drag probe is dead weight on every other load, so it only loads behind ?probe.
if (new URLSearchParams(location.search).has("probe")) {
	import("./probe.js");
}
