/**
 * A static server for the lab, with no dependencies.
 *
 * The lab runs over HTTP rather than `file://` for one reason: the modal loads
 * its stylesheets as CSS module scripts (`import sheet from "./modal.css" with
 * { type: "css" }`), which is the mechanism the shipped library will use to get
 * a real `CSSStyleSheet` into its shadow root without a build step or a string
 * literal. `file://` blocks module loading outright, and the workaround — a
 * `<link>` inside the shadow root — is exactly the kind of prototype-only path
 * that makes a lab stop telling you the truth about the real component.
 *
 * The repository root is the document root so that `/node_modules/...` and
 * `/packages/...` both resolve, which is what lets the lab load
 * `qr-code-styling` from where pnpm actually put it.
 */

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const ENTRY = "/packages/ui/lab/index.html";
const PORT = Number(process.env.PORT ?? 5173);

const TYPES = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".mjs", "text/javascript; charset=utf-8"],
	[".ts", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".png", "image/png"],
	[".woff2", "font/woff2"],
]);

const server = createServer((request, response) => {
	const url = new URL(request.url ?? "/", "http://localhost");

	// Redirect rather than serving the entry at `/`. Serving it there would
	// leave the document URL at the root, so every relative reference on the
	// page — `./lab.js` — would resolve against `/` instead of the lab
	// directory, 404, and be blocked for its MIME type.
	if (url.pathname === "/") {
		response.writeHead(302, { location: ENTRY }).end();
		return;
	}

	const requested = decodeURIComponent(url.pathname);

	// Normalise before resolving so `..` cannot walk out of the repository.
	const target = join(ROOT, normalize(requested));
	if (target !== ROOT && !target.startsWith(ROOT + sep)) {
		response.writeHead(403).end("Forbidden");
		return;
	}

	stat(target)
		.then(async (info) => {
			if (!info.isFile()) throw new Error("not a file");
			const headers = {
				"content-type": TYPES.get(extname(target)) ?? "application/octet-stream",
				// The lab is edited constantly; a cached stylesheet is a wasted
				// review round.
				"cache-control": "no-store",
			};

			// The component is written in TypeScript, like the rest of the
			// repository. Node strips the types on the way out, so the browser
			// gets plain JavaScript and the source never has to be duplicated,
			// bundled, or downgraded to JSDoc to stay loadable.
			if (extname(target) === ".ts") {
				const source = await readFile(target, "utf8");
				response.writeHead(200, headers);
				response.end(stripTypeScriptTypes(source, { mode: "strip" }));
				return;
			}

			response.writeHead(200, headers);
			createReadStream(target).pipe(response);
		})
		.catch(() => {
			response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
		});
});

server.listen(PORT, () => {
	process.stdout.write(`Lab running at http://localhost:${PORT}${ENTRY}\n`);
});
