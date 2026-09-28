/**
 * Tests for the generated asset module and the curated wallet and protocol
 * data built from it.
 *
 * Two failures these catch that nothing else can: a committed
 * `assets.generated.ts` that has drifted from the sources it claims to be
 * built from, and a wallet or protocol entry that points at data the other
 * does not have — a wallet naming a protocol that does not exist, or one with
 * no matching directory entry.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	BCHC_DIRECTORY,
	BCHC_PROTOCOLS,
	BCHC_WALLETS,
} from "../src/defaults.ts";
import type { ProtocolId } from "../src/state.ts";
import { buildAssetsModule, EXPORTS } from "../tools/assets/generate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED = join(HERE, "..", "src", "assets.generated.ts");

const PROTOCOL_IDS: readonly ProtocolId[] = [
	"wizardconnect",
	"walletconnect",
	"cashconnect",
];

const WEBP_PREFIX = "data:image/webp;base64,";
const SVG_PREFIX = "data:image/svg+xml,";

describe("the committed artifact", () => {
	it("matches what the generator produces right now", async () => {
		const onDisk = await readFile(GENERATED, "utf8");
		expect(onDisk).toBe(await buildAssetsModule());
	});

	it("says it is generated, so nobody edits it by hand", async () => {
		const text = await readFile(GENERATED, "utf8");
		expect(text).toContain("GENERATED FILE - do not edit by hand");
		expect(text).toContain("packages/ui/assets");
	});
});

describe("the exported data URIs", () => {
	it("carry a recognised MIME prefix and decode to real image bytes", async () => {
		const text = await readFile(GENERATED, "utf8");
		const matches = [
			...text.matchAll(/export const (\w+): string = "([^"]+)";/g),
		];
		// A regression this guards against: a future export that is neither a
		// WebP nor an inlined SVG, and so is silently skipped by both branches
		// below and never actually checked.
		expect(matches.length).toBe(EXPORTS.length);
		for (const match of matches) {
			const name = match[1];
			const value = match[2];
			if (value === undefined || name === undefined) {
				throw new Error("Malformed export in assets.generated.ts.");
			}
			if (value.startsWith(WEBP_PREFIX)) {
				const buffer = Buffer.from(value.slice(WEBP_PREFIX.length), "base64");
				expect(buffer.length, name).toBeGreaterThan(0);
				expect(buffer.toString("ascii", 0, 4), name).toBe("RIFF");
				expect(buffer.toString("ascii", 8, 12), name).toBe("WEBP");
			} else if (value.startsWith(SVG_PREFIX)) {
				const decoded = decodeURIComponent(value.slice(SVG_PREFIX.length));
				expect(decoded, name).toContain("<svg");
			} else {
				throw new Error(`${name} has an unrecognised data URI prefix.`);
			}
		}
	});
});

describe("BCHC_WALLETS", () => {
	it("names only protocols that actually exist", () => {
		for (const wallet of BCHC_WALLETS) {
			for (const protocol of wallet.protocols) {
				expect(PROTOCOL_IDS, wallet.id).toContain(protocol);
			}
		}
	});

	it("has a BCHC_DIRECTORY entry for every wallet", () => {
		const directoryIds = new Set(BCHC_DIRECTORY.map((entry) => entry.id));
		for (const wallet of BCHC_WALLETS) {
			expect(directoryIds.has(wallet.id), wallet.id).toBe(true);
		}
	});
});

describe("BCHC_PROTOCOLS", () => {
	it("is supported by at least one wallet", () => {
		for (const protocol of BCHC_PROTOCOLS) {
			const supported = BCHC_WALLETS.some((wallet) =>
				wallet.protocols.includes(protocol.id),
			);
			expect(supported, protocol.id).toBe(true);
		}
	});
});

describe("importing the defaults on the server", () => {
	it("does not throw", async () => {
		await expect(import("../src/defaults.ts")).resolves.toBeDefined();
	});
});
