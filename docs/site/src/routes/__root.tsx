import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { SITE_URL } from "@/landing/content";
import appCss from "@/styles/app.css?url";

const OG_TITLE = "BCH Connect — connect every Bitcoin Cash wallet";
const OG_DESCRIPTION =
	"BCH Connect is one typed client for WizardConnect, WalletConnect and CashConnect, with a connect modal ready to ship.";
const OG_IMAGE = `${SITE_URL}/og.jpg`;
const OG_IMAGE_ALT =
	"Three connection protocols, WizardConnect, WalletConnect and CashConnect, lead into one Connect wallet button that opens the BCH Connect modal";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "BCH Connect",
			},
			{
				name: "theme-color",
				content: "#fcfdfc",
				media: "(prefers-color-scheme: light)",
			},
			{
				name: "theme-color",
				content: "#101211",
				media: "(prefers-color-scheme: dark)",
			},
			{ name: "description", content: OG_DESCRIPTION },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "BCH Connect" },
			{ property: "og:url", content: SITE_URL },
			{ property: "og:title", content: OG_TITLE },
			{ property: "og:description", content: OG_DESCRIPTION },
			{ property: "og:image", content: OG_IMAGE },
			{ property: "og:image:type", content: "image/jpeg" },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:image:alt", content: OG_IMAGE_ALT },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: OG_TITLE },
			{ name: "twitter:description", content: OG_DESCRIPTION },
			{ name: "twitter:image", content: OG_IMAGE },
			{ name: "twitter:image:alt", content: OG_IMAGE_ALT },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="flex flex-col min-h-screen">
				<RootProvider>
					<Outlet />
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
