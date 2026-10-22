#!/usr/bin/env bash
# Type-checks this consumer project against core's packed tarball with every
# TypeScript compiler the root installs. Run after `pnpm build`.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
pkg="$(dirname "$here")"
root="$(cd "$pkg/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

(cd "$pkg" && pnpm pack --out "$work/core.tgz" >/dev/null)
mkdir -p "$work/node_modules/@bchconnect/core"
tar -xzf "$work/core.tgz" -C "$work/node_modules/@bchconnect/core" --strip-components=1
cp "$here"/index.ts "$here"/index.cts "$here"/tsconfig*.json "$work"/
echo '{ "type": "module" }' >"$work/package.json"

for compiler in typescript typescript-5.9; do
	tsc="$root/node_modules/$compiler/bin/tsc"
	[ -f "$tsc" ] || { echo "missing $compiler" >&2; exit 1; }
	for config in tsconfig.json tsconfig.default.json; do
		echo "$compiler $(node "$tsc" --version) $config"
		node "$tsc" -p "$work/$config"
	done
done
