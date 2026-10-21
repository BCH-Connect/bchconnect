import { TransportError } from "../errors.js";
import type { KeyValueStore } from "../types/protocol.js";

const MAX_AGE_SECONDS = 34_560_000; // 400 days
const MAX_COOKIE_BYTES = 4096;

/**
 * Creates a key-value store kept in cookies.
 *
 * A server can read the client snapshot from the request
 * and render the connected state on first paint.
 *
 * In the browser it reads and writes `document.cookie`, and `cookieHeader` is
 * ignored. On the server it reads `cookieHeader`, the request's `Cookie`
 * header.
 *
 * `set()` rejects with {@link TransportError} when the encoded name and value
 * exceed 4096 bytes.
 *
 * @example
 * ```ts
 * // Shared by the server render and the browser.
 * function makeClient(cookieHeader?: string) {
 *   return createClient({ ...config, ssr: true, storage: cookieStorage(cookieHeader) });
 * }
 *
 * makeClient(request.headers.get("cookie") ?? undefined); // server, per request
 * makeClient(); // browser
 * ```
 *
 * @public
 */
export function cookieStorage(cookieHeader?: string): KeyValueStore {
	const requestCookies = parseCookies(cookieHeader ?? "");

	return {
		async get(key) {
			const cookies =
				typeof document === "undefined"
					? requestCookies
					: parseCookies(document.cookie);
			return cookies.get(key);
		},
		async set(key, value) {
			const name = encodeURIComponent(key);
			const encoded = encodeURIComponent(value);
			if (name.length + encoded.length > MAX_COOKIE_BYTES) {
				throw new TransportError(
					`Cookie "${key}" exceeds ${MAX_COOKIE_BYTES} bytes`,
				);
			}

			if (typeof document === "undefined") {
				requestCookies.set(key, value);
				return;
			}
			const secure = location.protocol === "https:" ? "; Secure" : "";
			// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API needs a secure context and is missing from older Safari and Firefox.
			document.cookie = `${name}=${encoded}; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
		},
		async delete(key) {
			if (typeof document === "undefined") {
				requestCookies.delete(key);
				return;
			}
			// biome-ignore lint/suspicious/noDocumentCookie: as in set().
			document.cookie = `${encodeURIComponent(key)}=; Path=/; SameSite=Lax; Max-Age=0`;
		},
	};
}

/**
 * Parses a `Cookie` header or `document.cookie` into decoded names and values.
 * The first of two cookies with the same name wins; cookies that fail to
 * decode are skipped.
 *
 * @example
 * ```ts
 * parseCookies("a=1; b=%7B%7D").get("b"); // "{}"
 * ```
 *
 * @internal
 */
export function parseCookies(header: string): Map<string, string> {
	const cookies = new Map<string, string>();
	for (const part of header.split(";")) {
		const separator = part.indexOf("=");
		if (separator === -1) continue;
		try {
			const name = decodeURIComponent(part.slice(0, separator).trim());
			// Browsers list the cookie with the most specific path first.
			if (!cookies.has(name)) {
				cookies.set(name, decodeURIComponent(part.slice(separator + 1).trim()));
			}
		} catch {
			// Other code on the site can write cookies that are not URI-encoded; skip them.
		}
	}

	return cookies;
}
