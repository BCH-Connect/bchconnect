import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { Star } from "lucide-react";
import { ConnectDemo } from "@/components/connect-demo";
import { ProtocolGraph } from "@/components/protocol-graph";
import { Wordmark } from "@/components/wordmark";
import { baseOptions } from "@/lib/layout.shared";
import { gitConfig } from "@/lib/shared";
import "@/styles/landing.css";

const repoUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "BCH Connect — connect every Bitcoin Cash wallet" },
			{
				name: "description",
				content:
					"BCH Connect is one typed client for WizardConnect, WalletConnect and CashConnect, with a connect modal you can ship as it is.",
			},
		],
	}),
	component: Home,
});

const PROTOCOLS = [
	{
		id: "wizardconnect",
		name: "WizardConnect",
		mark: "/marks/wizardconnect.webp",
		copy: "Live the moment the modal opens, over a Nostr relay.",
	},
	{
		id: "walletconnect",
		name: "WalletConnect",
		mark: "/marks/walletconnect.svg",
		copy: "The broadest wallet support today, using the bch-wc2 specification.",
	},
	{
		id: "cashconnect",
		name: "CashConnect",
		mark: "/marks/cashconnect.webp",
		copy: "Built for contracts; still in preview.",
	},
] as const;

const COMPARISON = [
	{
		label: "Knows the wallet is there",
		wizardconnect: "Yes, from the wallet's ready signal and pings",
		walletconnect: "No liveness signal; reported as unknown",
		cashconnect: "Yes, from pings",
	},
	{
		label: "Wallet refuses to connect",
		wizardconnect: "The attempt ends as declined",
		walletconnect: "The attempt ends as declined",
		cashconnect: "Silence; the attempt waits unless you set a deadline",
	},
	{
		label: "Request expiry on the wire",
		wizardconnect: "None",
		walletconnect: "Required, between 5 minutes and 7 days",
		cashconnect: "Set by the connector",
	},
] as const;

const ACCESSIBILITY = [
	{
		term: "Screen readers",
		detail:
			"The modal is a labelled dialog, and every change of state is announced as it happens.",
	},
	{
		term: "Keyboard",
		detail:
			"Arrow keys move through the session types, Escape closes, and focus is always visible.",
	},
	{
		term: "Contrast",
		detail:
			"Every accent and neutral you can pick is checked against WCAG contrast floors, in light and dark.",
	},
	{
		term: "Motion and display",
		detail:
			"Reduced motion is respected, and the modal holds up in Windows high contrast mode.",
	},
] as const;

function Home() {
	return (
		<HomeLayout {...baseOptions()}>
			<section className="landing-hero">
				<div className="landing-hero-inner">
					<div className="landing-hero-fade">
						<h1 className="landing-headline">
							Connect every Bitcoin Cash wallet.
						</h1>
						<p className="landing-sub">
							BCH Connect is one typed client for WizardConnect, WalletConnect
							and CashConnect, with a connect modal you can ship as it is.
						</p>
						<div className="landing-actions">
							<ConnectDemo />
							<Link
								to="/docs/$"
								// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
								params={{ _splat: "" }}
								className="landing-cta-secondary"
							>
								Read the docs
							</Link>
						</div>
						<p className="landing-note">
							Pre-release. The modal is a live preview; connecting isn't wired
							up yet.
						</p>
					</div>
					<ProtocolGraph />
				</div>
			</section>

			<section className="landing-section" aria-labelledby="protocols-heading">
				<h2 id="protocols-heading">Protocols as peers</h2>
				<div className="landing-protocols">
					{PROTOCOLS.map((protocol) => (
						<div className="landing-protocol" key={protocol.id}>
							<h3>
								<img
									className="landing-protocol-mark"
									src={protocol.mark}
									alt=""
									width={32}
									height={32}
								/>
								{protocol.name}
							</h3>
							<p>{protocol.copy}</p>
						</div>
					))}
				</div>
				<Link
					to="/docs/$"
					// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
					params={{ _splat: "concepts/protocols" }}
					className="landing-link"
				>
					How the protocols compare
				</Link>
			</section>

			<section className="landing-section" aria-labelledby="ship-heading">
				<h2 id="ship-heading">Ship the modal, or build your own</h2>
				<div className="landing-split">
					<p>
						<strong>The default UI.</strong>
						The modal ships styled and ready to go. Pick an accent, a neutral
						family, a radius, a font, how much blur sits behind it, and light,
						dark, or automatic. The system keeps every combination readable.
					</p>
					<p>
						<strong>Headless.</strong>
						Or skip the shipped interface and drive your own from the same
						connection state: every screen, every wallet, and every failure,
						exactly as the default modal sees them.
					</p>
				</div>
				<Link
					to="/docs/$"
					// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
					params={{ _splat: "concepts" }}
					className="landing-link"
				>
					Read the concepts guide
				</Link>
			</section>

			<section
				className="landing-section landing-a11y"
				aria-labelledby="a11y-heading"
			>
				<div>
					<h2 id="a11y-heading">Accessible by default</h2>
					<p className="landing-a11y-lede">
						People link wallets with a keyboard, a screen reader, or a phone in
						bright sun. The modal is built for all of them, so you don't start
						from zero.
					</p>
				</div>
				<dl className="landing-facts">
					{ACCESSIBILITY.map((fact) => (
						<div key={fact.term}>
							<dt>{fact.term}</dt>
							<dd>{fact.detail}</dd>
						</div>
					))}
				</dl>
			</section>

			<section className="landing-section" aria-labelledby="honest-heading">
				<h2 id="honest-heading">Honest about differences</h2>
				<div className="landing-table-wrap">
					<table className="landing-table">
						<caption>
							How each session type reports what's happening on the other end.
						</caption>
						<thead>
							<tr>
								<th scope="col">
									<span className="sr-only">Behavior</span>
								</th>
								<th scope="col">WizardConnect</th>
								<th scope="col">WalletConnect</th>
								<th scope="col">CashConnect</th>
							</tr>
						</thead>
						<tbody>
							{COMPARISON.map((row) => (
								<tr key={row.label}>
									<th scope="row">{row.label}</th>
									<td data-label="WizardConnect">{row.wizardconnect}</td>
									<td data-label="WalletConnect">{row.walletconnect}</td>
									<td data-label="CashConnect">{row.cashconnect}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<Link
					to="/docs/$"
					// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
					params={{ _splat: "concepts/protocols" }}
					className="landing-link"
				>
					See the full comparison
				</Link>
			</section>

			<section className="landing-band" aria-labelledby="close-heading">
				<div className="landing-section">
					<h2 id="close-heading">Open source, MIT licensed.</h2>
					<p className="landing-band-lede">
						Start with how it works. The guides and reference fill in as each
						package lands.
					</p>
					<div className="landing-close-actions">
						<Link
							to="/docs/$"
							// biome-ignore lint/style/useNamingConvention: `_splat` is TanStack Router's catch-all param name
							params={{ _splat: "" }}
							className="landing-cta-primary"
						>
							Read the docs
						</Link>
						<a
							href={repoUrl}
							target="_blank"
							rel="noreferrer noopener"
							className="landing-star-link"
						>
							<Star className="size-4" aria-hidden="true" />
							Star on GitHub
						</a>
					</div>
				</div>
			</section>

			<footer className="landing-footer">
				<Wordmark />
				<div className="landing-footer-links">
					<a href={repoUrl} target="_blank" rel="noreferrer noopener">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
						</svg>
						<span className="sr-only">GitHub</span>
					</a>
					<span>© BCH Connect contributors</span>
				</div>
			</footer>
		</HomeLayout>
	);
}
