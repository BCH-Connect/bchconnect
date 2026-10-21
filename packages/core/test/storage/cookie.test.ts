import { afterEach, describe, expect, it, vi } from "vitest";
import { cookieStorage } from "../../src/storage/cookie.js";

// A minimal cookie jar: reads join name=value pairs, writes honor Max-Age=0.
function stubDocument(initial = "", protocol = "https:") {
	const jar = new Map<string, string>();
	for (const pair of initial.split("; ").filter(Boolean)) {
		const separator = pair.indexOf("=");
		jar.set(pair.slice(0, separator), pair.slice(separator + 1));
	}
	const writes: string[] = [];

	vi.stubGlobal("document", {
		get cookie() {
			return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
		},
		set cookie(cookie: string) {
			writes.push(cookie);
			const [pair = "", ...attributes] = cookie.split("; ");
			const separator = pair.indexOf("=");
			const name = pair.slice(0, separator);
			if (attributes.includes("Max-Age=0")) jar.delete(name);
			else jar.set(name, pair.slice(separator + 1));
		},
	});
	vi.stubGlobal("location", { protocol });

	return { jar, writes };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("cookieStorage", () => {
	describe("in the browser", () => {
		it("should write an encoded, persistent cookie", async () => {
			const { writes } = stubDocument();

			await cookieStorage().set("bchconnect:client:v1", '{"a":"b; c"}');

			expect(writes).toEqual([
				"bchconnect%3Aclient%3Av1=%7B%22a%22%3A%22b%3B%20c%22%7D; Path=/; SameSite=Lax; Max-Age=34560000; Secure",
			]);
		});

		it("should leave out Secure on an http page", async () => {
			const { writes } = stubDocument("", "http:");

			await cookieStorage().set("key", "value");

			expect(writes).toEqual([
				"key=value; Path=/; SameSite=Lax; Max-Age=34560000",
			]);
		});

		it("should read back what it wrote", async () => {
			stubDocument();
			const storage = cookieStorage();

			await storage.set("bchconnect:client:v1", '{"a":"b; c"}');

			await expect(storage.get("bchconnect:client:v1")).resolves.toBe(
				'{"a":"b; c"}',
			);
		});

		it("should read cookies written elsewhere, live", async () => {
			const { jar } = stubDocument();
			const storage = cookieStorage();
			await expect(storage.get("key")).resolves.toBeUndefined();

			jar.set("key", "value");

			await expect(storage.get("key")).resolves.toBe("value");
		});

		it("should ignore the header", async () => {
			stubDocument();

			await expect(
				cookieStorage("key=from-header").get("key"),
			).resolves.toBeUndefined();
		});

		it("should expire the cookie on delete", async () => {
			const { jar, writes } = stubDocument("key=value");
			const storage = cookieStorage();

			await storage.delete("key");

			expect(writes).toEqual(["key=; Path=/; SameSite=Lax; Max-Age=0"]);
			expect(jar.has("key")).toBe(false);
		});

		it("should skip a cookie that is not URI-encoded", async () => {
			stubDocument("broken=%E0%A4%A; key=value");

			await expect(cookieStorage().get("key")).resolves.toBe("value");
		});

		it("should reject a cookie over 4096 bytes and keep the previous one", async () => {
			const { jar, writes } = stubDocument("key=old");

			await expect(
				cookieStorage().set("key", "x".repeat(4094)),
			).rejects.toMatchObject({
				code: "TRANSPORT",
				message: 'Cookie "key" exceeds 4096 bytes',
			});
			expect(writes).toEqual([]);
			expect(jar.get("key")).toBe("old");
		});

		it("should accept a name and value of exactly 4096 bytes", async () => {
			const { writes } = stubDocument();

			await cookieStorage().set("key", "x".repeat(4093));

			expect(writes).toHaveLength(1);
		});

		it("should count the encoded size", async () => {
			stubDocument();

			await expect(
				cookieStorage().set("key", ";".repeat(1400)),
			).rejects.toMatchObject({ code: "TRANSPORT" });
		});
	});

	describe("on the server", () => {
		it.each<[string, string, [string, string | undefined][]]>([
			[
				"optional whitespace",
				"FOO    = bar;   baz  =   raz",
				[
					["FOO", "bar"],
					["baz", "raz"],
				],
			],
			["tabs", "\tfoo\t=\tbar\t", [["foo", "bar"]]],
			["an empty header", " \t ", [["", undefined]]],
			[
				"empty values",
				"foo=; bar=",
				[
					["foo", ""],
					["bar", ""],
				],
			],
			["encoded values", "email=%20%22%2c%3b%2f", [["email", ' ",;/']]],
			["quoted values, quotes kept", 'foo="bar"', [["foo", '"bar"']]],
			[
				"pairs without '='",
				"foo=bar;fizz  ;  buzz",
				[
					["foo", "bar"],
					["fizz", undefined],
					["buzz", undefined],
				],
			],
			["a pair without '=' first", "  fizz; foo=  bar", [["foo", "bar"]]],
			[
				"an empty first duplicate",
				"foo=;bar=bar;foo=boo",
				[
					["foo", ""],
					["bar", "bar"],
				],
			],
			[
				"names of Object.prototype members",
				"toString=foo;__proto__=bar;constructor=",
				[
					["toString", "foo"],
					["__proto__", "bar"],
					["constructor", ""],
					["valueOf", undefined],
				],
			],
			[
				"a value that fails to decode, skipped",
				"foo=%1;bar=bar",
				[
					["foo", undefined],
					["bar", "bar"],
				],
			],
		])("should parse %s", async (_, header, pairs) => {
			const storage = cookieStorage(header);

			for (const [key, value] of pairs) {
				await expect(storage.get(key)).resolves.toBe(value);
			}
		});

		it("should read the request's cookie header", async () => {
			const storage = cookieStorage(
				"theme=dark; bchconnect%3Aclient%3Av1=%7B%22a%22%3A1%7D",
			);

			await expect(storage.get("bchconnect:client:v1")).resolves.toBe(
				'{"a":1}',
			);
			await expect(storage.get("theme")).resolves.toBe("dark");
		});

		it("should take the first of two cookies with the same name", async () => {
			const storage = cookieStorage("key=specific; key=general");

			await expect(storage.get("key")).resolves.toBe("specific");
		});

		it("should keep an '=' inside a value and trim around pairs", async () => {
			const storage = cookieStorage("  a=b=c ;  key = value ");

			await expect(storage.get("a")).resolves.toBe("b=c");
			await expect(storage.get("key")).resolves.toBe("value");
		});

		it("should return undefined without a header", async () => {
			await expect(cookieStorage().get("key")).resolves.toBeUndefined();
		});

		it("should keep writes within the store", async () => {
			const storage = cookieStorage("key=old");

			await storage.set("key", "new");
			await storage.set("other", "value");
			await storage.delete("other");

			await expect(storage.get("key")).resolves.toBe("new");
			await expect(storage.get("other")).resolves.toBeUndefined();
			await expect(cookieStorage("key=old").get("key")).resolves.toBe("old");
		});

		it("should reject a cookie over 4096 bytes", async () => {
			const storage = cookieStorage();

			await expect(storage.set("key", "x".repeat(4094))).rejects.toMatchObject({
				code: "TRANSPORT",
			});
			await expect(storage.get("key")).resolves.toBeUndefined();
		});
	});
});
