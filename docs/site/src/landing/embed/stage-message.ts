import type { BchcAccent, BchcRadius } from "@bchconnect/ui";

/** What the features page tells the modal it embeds. */
export interface StageLook {
	readonly accent: BchcAccent;
	readonly radius: BchcRadius;
	readonly mode: "dark" | "light";
}

export const STAGE_MESSAGE = "bchc-stage-look";

export interface StageMessage extends StageLook {
	readonly type: typeof STAGE_MESSAGE;
}

export function isStageMessage(data: unknown): data is StageMessage {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { type?: unknown }).type === STAGE_MESSAGE
	);
}

/** Sent by the embedded page once it listens, so no look is posted before it can be heard. */
export const STAGE_READY = "bchc-stage-ready";

/** Sent by the embedded page with the drawer's full height, so a phone screen can fit it. */
export const STAGE_SIZE = "bchc-stage-size";

/** Each accent the stage offers, with its family's step 9, the shade the modal fills its accent with. */
export const STAGE_ACCENTS: ReadonlyArray<readonly [BchcAccent, string]> = [
	["violet", "#9259ea"],
	["green", "#08c18e"],
	["cyan", "#00b2d1"],
	["blue", "#427ff7"],
	["pink", "#e253ae"],
	["amber", "#e49900"],
];
