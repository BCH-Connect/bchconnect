// qr-code-styling is imported only here, so an import that skips
// defineElements never loads it (every module ships side-effect free).
import QrCodeStyling from "qr-code-styling";
import type { CodeRenderer } from "./code.ts";
import { register } from "./register.ts";

/**
 * Registers `<bchc-modal>` and `<bchc-toast>`. Idempotent and a no-op on a
 * server, so it's safe to call from shared code.
 *
 * @example
 * ```ts
 * defineElements();
 * const modal = document.createElement("bchc-modal");
 * ```
 *
 * @beta
 */
export function defineElements(): void {
	// Cast narrowly here rather than widening `CodeRenderer` to match this one library's shape.
	register(QrCodeStyling as unknown as CodeRenderer);
}
