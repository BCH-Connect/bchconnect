import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<HomeLayout {...baseOptions()}>
			<div className="flex flex-col flex-1 justify-center items-center gap-4 px-4 py-8 text-center">
				<span className="rounded-full border px-3 py-1 text-xs text-fd-muted-foreground">
					Pre-release
				</span>
				<h1 className="font-semibold text-3xl">BCH Connect</h1>
				<p className="max-w-xl text-fd-muted-foreground">
					One wallet-connection library for Bitcoin Cash dapps, over every
					dapp–wallet protocol.
				</p>
				<Link
					to="/docs/$"
					// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
					params={{ _splat: "" }}
					className="px-3 py-2 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm"
				>
					Open docs
				</Link>
			</div>
		</HomeLayout>
	);
}
