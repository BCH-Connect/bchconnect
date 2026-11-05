// The "Get a wallet" screen: wallets to install, never ones to connect.

import { html, type TemplateResult } from "lit";
import { safeHref } from "./html.ts";
import { icon } from "./icons.ts";
import type { BchcMessages } from "./messages.ts";
import type { WalletDirectoryEntry } from "./state.ts";

/** Draws a logo, falling back to the generic wallet tile. @internal */
export type LogoTemplate = (
	logo: string | null,
	size: number,
	extraClass: string,
) => TemplateResult;

/** The directory screen's body. @internal */
export function directoryScreen(
	directory: readonly WalletDirectoryEntry[],
	messages: BchcMessages,
	logoTemplate: LogoTemplate,
): TemplateResult {
	return html`
		<div class="single">
			<p class="section-label">${messages.directoryHeading}</p>
			<div class="directory">
				${directory.map((entry) => {
					const href = entry.link === null ? null : safeHref(entry.link.href);
					const logo = logoTemplate(entry.logo, 36, "directory-logo");
					const name = html`<span class="wallet-name" title=${entry.name}>${entry.name}</span>`;
					if (href === null)
						return html`
					<div class="directory-row">
						${logo}
						${name}
					</div>`;
					return html`
					<a class="directory-row" href=${href} target="_blank" rel="noreferrer">
						${logo}
						${name}
						<span class="directory-links">
							<span class="button pill">${entry.link?.label ?? messages.getWallet(entry.name)}${icon("arrowUpRight", 14)}</span>
						</span>
					</a>`;
				})}
			</div>
		</div>
	`;
}
