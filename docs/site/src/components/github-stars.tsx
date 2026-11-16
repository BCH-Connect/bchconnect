import { type CSSProperties, useEffect, useState } from "react";
import { GithubMark } from "@/components/github-mark";
import { appName, gitConfig, repoUrl } from "@/lib/shared";

interface StarCache {
	count: number;
	at: number;
}

const cacheKey = `github-stars:${gitConfig.user}/${gitConfig.repo}`;
const cacheTtlMs = 60 * 60 * 1000;
const compactFormatter = new Intl.NumberFormat("en", { notation: "compact" });

function readCache(): number | null {
	try {
		const raw = localStorage.getItem(cacheKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StarCache;
		if (Date.now() - parsed.at > cacheTtlMs) return null;
		return parsed.count;
	} catch {
		return null;
	}
}

function writeCache(count: number) {
	try {
		const entry: StarCache = { count, at: Date.now() };
		localStorage.setItem(cacheKey, JSON.stringify(entry));
	} catch {
		// storage unavailable; the count simply refetches next visit
	}
}

export function GithubStars() {
	// Starts empty so the first client render matches the server's; the cache is read after hydration.
	const [count, setCount] = useState<number | null>(null);

	useEffect(() => {
		const cached = readCache();
		if (cached !== null) {
			setCount(cached);
			return;
		}
		const controller = new AbortController();

		async function load() {
			try {
				const res = await fetch(
					`https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}`,
					{ signal: controller.signal },
				);
				if (!res.ok) return;
				const data = (await res.json()) as Record<string, unknown>;
				// biome-ignore lint/complexity/useLiteralKeys: dot access is rejected under noPropertyAccessFromIndexSignature
				const value = data["stargazers_count"];
				if (typeof value !== "number") return;
				setCount(value);
				writeCache(value);
			} catch {
				// network failure: keep the count segment hidden, no fake number
			}
		}

		void load();
		return () => controller.abort();
	}, []);

	const label =
		count === null
			? `Star ${appName} on GitHub`
			: `Star ${appName} on GitHub, ${count} stars`;

	return (
		<a
			href={repoUrl}
			target="_blank"
			rel="noreferrer noopener"
			aria-label={label}
			className="github-stars"
		>
			<GithubMark className="github-stars-mark" />
			<span className="github-stars-label">Star</span>
			<span className="github-stars-rule" aria-hidden="true" />
			<span className="github-stars-count">
				<span className="github-stars-star" aria-hidden="true">
					<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
						<path d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11a.56.56 0 0 0 .47.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.39a.56.56 0 0 1-.84.61l-4.73-2.89a.56.56 0 0 0-.59 0l-4.73 2.89a.56.56 0 0 1-.84-.61l1.28-5.39a.56.56 0 0 0-.18-.56l-4.2-3.6a.56.56 0 0 1 .32-.99l5.52-.44a.56.56 0 0 0 .47-.35z" />
					</svg>
					{Array.from({ length: 5 }, (_, i) => (
						<i
							// biome-ignore lint/suspicious/noArrayIndexKey: five fixed sparks
							key={i}
							className="github-stars-spark"
							style={{ "--a": `${i * 72 - 90}deg` } as CSSProperties}
						/>
					))}
				</span>
				{count !== null && <span>{compactFormatter.format(count)}</span>}
			</span>
		</a>
	);
}
