import type { WalletSelection } from "../types/client.js";
import type { Session, WalletIdentity } from "../types/protocol.js";

/**
 * Combines the wallet identity the protocol sent with the wallet the user
 * picked. A protocol that sent a name has identified the wallet, and the pick
 * may name another one (any wallet can answer a QR code), so the pick is then
 * ignored. Otherwise the pick fills the fields the protocol left empty and
 * `source` is `"selection"`.
 *
 * Returns `session` as is when the protocol sent a name, there is no pick, or
 * the pick fills none of its gaps. Otherwise returns a new session and never
 * modifies the original.
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
	selection?: WalletSelection,
): S {
	if (session.wallet.name !== undefined) return session;
	return fillWalletIdentity(session, selection);
}

function fillWalletIdentity<S extends Session>(
	session: S,
	from?: WalletSelection,
): S {
	const { wallet } = session;
	const id = wallet.id ?? from?.id;
	const name = wallet.name ?? from?.name;
	const icon = wallet.icon ?? from?.icon;
	if (id === wallet.id && name === wallet.name && icon === wallet.icon) {
		return session;
	}

	const merged: WalletIdentity = {
		source: wallet.name !== undefined ? "protocol" : "selection",
	};
	if (id !== undefined) merged.id = id;
	if (name !== undefined) merged.name = name;
	if (icon !== undefined) merged.icon = icon;

	return { ...session, wallet: merged };
}

/**
 * Carries an earlier wallet identity of the same session onto a newer
 * snapshot of it.
 *
 * @example
 * ```ts
 * const next = keepWalletIdentity(changed, previous.wallet);
 * ```
 *
 * @internal
 */
export function keepWalletIdentity<S extends Session>(
	session: S,
	wallet: WalletIdentity,
): S {
	const merged = fillWalletIdentity(session, wallet);
	if (merged === session || session.wallet.name !== undefined) return merged;

	return { ...merged, wallet: { ...merged.wallet, source: wallet.source } };
}
