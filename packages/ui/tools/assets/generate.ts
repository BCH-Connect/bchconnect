// Encodes wallet logos and protocol marks into the data-URI module.
// `pnpm assets -- --encode` rebuilds assets/web/*.webp (needs ImageMagick,
// not run in CI, so output is committed); no flag writes src/assets.generated.ts.

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(HERE, "..", "..", "assets");
const WEB_DIR = join(ASSETS_DIR, "web");
const OUT_FILE = join(HERE, "..", "..", "src", "assets.generated.ts");

interface RasterAsset {
	readonly name: string;
	readonly source: string;
	readonly args: readonly string[];
}

/** Wallet logos, resized to 88×88. Lossy for cashonize/optn; paytaca's source already encodes smaller lossless. */
const LOGOS: readonly RasterAsset[] = [
	{
		name: "cashonize",
		source: "cashonize.png",
		args: ["-resize", "88x88", "-quality", "82", "-define", "webp:method=6"],
	},
	{
		name: "optn",
		source: "optn.png",
		args: ["-resize", "88x88", "-quality", "82", "-define", "webp:method=6"],
	},
	{
		name: "paytaca",
		source: "paytaca.png",
		args: [
			"-resize",
			"88x88",
			"-define",
			"webp:lossless=true",
			"-define",
			"webp:method=6",
		],
	},
];

/** Protocol marks: kept at source size (104px) with boosted alpha quality, since each is a soft-edged shape. */
const MARKS: readonly RasterAsset[] = [
	{
		name: "mark-wizardconnect",
		source: "mark-wizardconnect.png",
		args: [
			"-quality",
			"85",
			"-define",
			"webp:alpha-quality=90",
			"-define",
			"webp:method=6",
		],
	},
	{
		name: "mark-cashconnect",
		source: "mark-cashconnect.png",
		args: [
			"-quality",
			"85",
			"-define",
			"webp:alpha-quality=90",
			"-define",
			"webp:method=6",
		],
	},
];

const RASTER: readonly RasterAsset[] = [...LOGOS, ...MARKS];

type ExportKind = "raster" | "svg";

interface AssetExport {
	readonly name: string;
	readonly kind: ExportKind;
	readonly file: string;
	readonly doc: string;
}

/** Every export the generated module carries; a test derives its expected count from this. */
export const EXPORTS: readonly AssetExport[] = [
	{
		name: "LOGO_CASHONIZE",
		kind: "raster",
		file: "cashonize",
		doc: "Cashonize's wallet-list logo.",
	},
	{
		name: "LOGO_OPTN",
		kind: "raster",
		file: "optn",
		doc: "OPTN's wallet-list logo.",
	},
	{
		name: "LOGO_PAYTACA",
		kind: "raster",
		file: "paytaca",
		doc: "Paytaca's wallet-list logo.",
	},
	{
		name: "LOGO_SELENE",
		kind: "svg",
		file: "selene.svg",
		doc: "Selene's wallet-list logo.",
	},
	{
		name: "MARK_WIZARDCONNECT",
		kind: "raster",
		file: "mark-wizardconnect",
		doc: "WizardConnect's mark, buried in the connection code.",
	},
	{
		name: "MARK_WALLETCONNECT",
		kind: "svg",
		file: "walletconnect-icon.svg",
		doc: "WalletConnect's mark, buried in the connection code.",
	},
	{
		name: "MARK_CASHCONNECT",
		kind: "raster",
		file: "mark-cashconnect",
		doc: "CashConnect's mark, buried in the connection code.",
	},
] as const;

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

// Strips what an authoring tool adds but a browser never draws (XML decl, metadata, comments).
function stripSvg(svg: string): string {
	return collapseWhitespace(
		svg
			.replace(/<\?xml[^>]*\?>/, "")
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(/<metadata>[\s\S]*?<\/metadata>/g, ""),
	);
}

// Escapes only chars that would end the URI/attribute; `%` first, so its own
// escapes aren't re-escaped. Plain encodeURIComponent would bloat the string.
function escapeSvgForUri(svg: string): string {
	return svg
		.replace(/%/g, "%25")
		.replace(/#/g, "%23")
		.replace(/</g, "%3C")
		.replace(/>/g, "%3E")
		.replace(/"/g, "'");
}

function svgDataUri(svg: string): string {
	return `data:image/svg+xml,${escapeSvgForUri(stripSvg(svg))}`;
}

async function webpDataUri(name: string): Promise<string> {
	const buffer = await readFile(join(WEB_DIR, `${name}.webp`));
	return `data:image/webp;base64,${buffer.toString("base64")}`;
}

async function valueFor(entry: AssetExport): Promise<string> {
	if (entry.kind === "svg") {
		return svgDataUri(await readFile(join(ASSETS_DIR, entry.file), "utf8"));
	}
	return webpDataUri(entry.file);
}

function banner(): string {
	return [
		"/**",
		" * GENERATED FILE - do not edit by hand.",
		" *",
		" * Source of truth: packages/ui/assets",
		" * Regenerate: node packages/ui/tools/assets/generate.ts",
		" * (pass --encode first to rebuild assets/web from the PNG sources; needs",
		" * ImageMagick's `magick` on PATH, so it isn't run in CI)",
		" */",
	].join("\n");
}

// Separate from main() so a test can rebuild and diff it without writing anything.
export async function buildAssetsModule(): Promise<string> {
	const blocks = await Promise.all(
		EXPORTS.map(async (entry) => {
			const value = await valueFor(entry);
			return [
				`/** ${entry.doc} @internal */`,
				`export const ${entry.name}: string = ${JSON.stringify(value)};`,
			].join("\n");
		}),
	);
	return `${banner()}\n\n${blocks.join("\n\n")}\n`;
}

async function encode(): Promise<void> {
	await mkdir(WEB_DIR, { recursive: true });
	for (const asset of RASTER) {
		const input = join(ASSETS_DIR, asset.source);
		const output = join(WEB_DIR, `${asset.name}.webp`);
		try {
			await run("magick", [input, ...asset.args, output]);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				throw new Error(
					"ImageMagick's `magick` command was not found on PATH. Install " +
						"ImageMagick 7, then rerun `pnpm assets -- --encode`.",
				);
			}
			throw error;
		}
	}
	process.stdout.write(`Encoded ${RASTER.length} assets into ${WEB_DIR}\n`);
}

async function main(): Promise<void> {
	if (process.argv.slice(2).includes("--encode")) {
		await encode();
		return;
	}
	await mkdir(dirname(OUT_FILE), { recursive: true });
	await writeFile(OUT_FILE, await buildAssetsModule(), "utf8");
	process.stdout.write(`Wrote ${OUT_FILE}\n`);
}

if (import.meta.main) {
	await main();
}
