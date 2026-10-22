/**
 * @packageDocumentation
 * Custom elements for the BCH Connect connect modal and success toast.
 * Register them once with {@link defineElements} before creating
 * `<bchc-modal>` or `<bchc-toast>`. Theme an element with `data-bchc-*`
 * attributes on the element itself: `data-bchc-accent`, `data-bchc-neutral`,
 * `data-bchc-radius`, `data-bchc-font`, `data-bchc-blur` and
 * `data-bchc-mode`, each taking the values of the exported `Bchc*` types.
 * Reword or translate an element's strings with its `messages` property,
 * typed by {@link BchcMessages}
 * The elements render with Lit: a page that enforces Trusted Types
 * (`require-trusted-types-for 'script'`) must allow the `lit-html` policy in
 * its `trusted-types` directive.
 */

import type { BchcModal, BchcModalEvents } from "./modal.ts";
import type { BchcToast, BchcToastEvents } from "./toast.ts";

export {
	BCHC_DIRECTORY,
	BCHC_PROTOCOLS,
	BCHC_WALLETS,
} from "./defaults.ts";
export { defineElements } from "./define.ts";
export type {
	HeadlessModalOptions,
	ModalActions,
	ModalRenderer,
} from "./headless.ts";
export { headlessModal } from "./headless.ts";
export type { BchcMessages } from "./messages.ts";
export { BCHC_MESSAGES_EN } from "./messages.ts";
export type { BchcModalEvents } from "./modal.ts";
export { BchcModal } from "./modal.ts";
export type {
	ConnectPhase,
	FailureReason,
	MarkShape,
	ModalScreen,
	ModalView,
	Network,
	ProtocolId,
	ProtocolMark,
	ProtocolOption,
	WalletDirectoryEntry,
	WalletOption,
	WalletSupport,
} from "./state.ts";
export type {
	BchcAccent,
	BchcBlur,
	BchcFont,
	BchcMode,
	BchcNeutral,
	BchcRadius,
} from "./theme.generated.ts";
export {
	BCHC_ACCENT_DEFAULT_NEUTRAL,
	BCHC_ACCENTS,
	BCHC_BLURS,
	BCHC_DEFAULT_ACCENT,
	BCHC_DEFAULT_NEUTRAL,
	BCHC_FONTS,
	BCHC_NEUTRALS,
	BCHC_RADII,
} from "./theme.generated.ts";
export type { BchcToastEvents, ToastView } from "./toast.ts";
export { BchcToast } from "./toast.ts";

declare global {
	interface HTMLElementTagNameMap {
		"bchc-modal": BchcModal;
		"bchc-toast": BchcToast;
	}
	// Events bubble out of the shadow root, so type them on any ancestor too.
	interface GlobalEventHandlersEventMap
		extends BchcModalEvents,
			BchcToastEvents {}
}
