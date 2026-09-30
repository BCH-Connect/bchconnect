// TEMPORARY: the accent lab's state, shared by the swatch rail and the demo
// modal. Delete with the rest of this folder once an accent is chosen.

export const LAB_ACCENTS = [
	"green",
	"cyan",
	"blue",
	"violet",
	"pink",
	"red",
	"amber",
	"ink",
] as const;

export type LabAccent = (typeof LAB_ACCENTS)[number];

/** Mirrors BCHC_ACCENT_DEFAULT_NEUTRAL; importing it would evaluate the package's custom elements. */
export const LAB_NEUTRAL: Readonly<Record<LabAccent, string>> = {
	green: "sage",
	cyan: "sage",
	blue: "slate",
	violet: "slate",
	pink: "slate",
	red: "sand",
	amber: "sand",
	ink: "pure",
};

/** The swatch colour; green has no family of its own on the site, it is the default `accent`. */
export function labSwatch(accent: LabAccent): string {
	return accent === "green" ? "#08c18e" : `var(--${accent}-9)`;
}

export const LAB_ATTRIBUTE = "data-accent-lab";
export const LAB_STORAGE_KEY = "bchc-site:accent-lab";

function isLabAccent(value: string | null | undefined): value is LabAccent {
	return (LAB_ACCENTS as readonly string[]).includes(value ?? "");
}

/** The accent the page wears now; green when the lab is not mounted. */
export function labAccent(): LabAccent {
	const value = document.documentElement.getAttribute(LAB_ATTRIBUTE);
	return isLabAccent(value) ? value : "green";
}

export function storedLabAccent(): LabAccent | null {
	try {
		const value = localStorage.getItem(LAB_STORAGE_KEY);
		return isLabAccent(value) ? value : null;
	} catch {
		return null;
	}
}

export function applyLabAccent(accent: LabAccent): void {
	document.documentElement.setAttribute(LAB_ATTRIBUTE, accent);
	try {
		localStorage.setItem(LAB_STORAGE_KEY, accent);
	} catch {
		// Private windows can refuse storage; the choice then lasts until reload.
	}
}
