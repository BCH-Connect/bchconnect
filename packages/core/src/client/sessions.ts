import type { ConnectOptions } from "../types/client.js";
import type { Session, WalletIdentity } from "../types/protocol.js";

/**
 * Combines the wallet identity the protocol sent with the wallet the user
 * picked. The protocol's fields win; the pick only fills the ones it left
 * empty. `source` is `"protocol"` when the protocol sent a name, else
 * `"selection"`.
 *
 * Without a pick, returns `session` as is. Otherwise returns a new session
 * and never modifies the original.
 *
 * @example
 * ```ts
 * const merged = mergeWalletIdentity(session, {
 *   id: "cashonize",
 *   name: "Cashonize",
 * });
 * ```
 *
 * @internal
 */
export function mergeWalletIdentity<S extends Session>(
	session: S,
	selection?: ConnectOptions["wallet"],
): S {
	if (selection === undefined) return session;

	const { wallet } = session;
	const merged: WalletIdentity = {
		source: wallet.name !== undefined ? "protocol" : "selection",
	};
	const id = wallet.id ?? selection.id;
	const name = wallet.name ?? selection.name;
	const icon = wallet.icon ?? selection.icon;
	if (id !== undefined) merged.id = id;
	if (name !== undefined) merged.name = name;
	if (icon !== undefined) merged.icon = icon;

	return { ...session, wallet: merged };
}
