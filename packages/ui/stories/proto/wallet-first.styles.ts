// Prototype-only additions over src/styles/modal.css; deleted with the prototype.

import { css } from "lit";

export const protoStyles = css`
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* Three rows shared by both columns: instructions on one baseline, the list starting at
	   the tile's top edge, and both footers on one bottom line. */
	.split {
		grid-template-rows: var(--footer-size) auto var(--footer-size);
		row-gap: var(--bchc-space-4);
		align-items: stretch;
	}

	.cell-label {
		margin: 0;
		align-self: center;
	}

	.cell-control,
	.cell-footer {
		display: flex;
		align-items: center;
		gap: var(--bchc-space-3);
		min-width: 0;
	}

	.cell-footer {
		justify-content: space-between;
	}

	.cell-footer .label {
		white-space: nowrap;
	}

	/* The tile alone sets the middle row's height; the list fills it and scrolls. */
	.cell-list {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		contain: size;
	}

	.cell-prompt {
		align-self: center;
	}

	.cell-prompt .get-one {
		margin: 0;
	}

	.caption.is-void,
	.actions.is-void {
		visibility: hidden;
		opacity: 0;
		pointer-events: none;
	}

	/* Selected: the accent at low opacity, nothing else. It spreads from the wallet's logo when
	   chosen and fades when another is, so a change reads as "this one" rather than a swap.
	   The tint is a layer under the content and over the row's own hover fill. */
	.wallet-row {
		position: relative;
		display: flex;
	}

	.wallet-row .wallet {
		--spread-x: 28px;
		flex: 1;
		min-width: 0;
		position: relative;
		isolation: isolate;
	}

	.overlay.is-rtl .wallet-row .wallet {
		--spread-x: calc(100% - 28px);
	}

	.wallet-row .wallet,
	.tab {
		--tint: light-dark(
			color-mix(in oklab, var(--bchc-accent) 12%, transparent),
			color-mix(in oklab, var(--bchc-accent) 16%, transparent)
		);
	}

	.wallet-row .wallet::before,
	.tab::before {
		content: "";
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background: var(--tint);
		opacity: 0;
		clip-path: circle(0 at var(--spread-x) 50%);
		transition:
			opacity var(--bchc-duration-fast) var(--bchc-ease-out),
			clip-path 0s linear var(--bchc-duration-fast);
	}

	.wallet-row.is-selected .wallet::before,
	.tab[aria-selected="true"]::before {
		opacity: 1;
		clip-path: circle(150% at var(--spread-x) 50%);
		transition:
			opacity 0s,
			clip-path calc(var(--bchc-duration-base) * 1.1) var(--bchc-ease-out);
	}

	.wallet-row.is-selected .wallet:hover {
		background: transparent;
	}

	.wallet-row.is-selected .wallet:hover img,
	.wallet-row.is-selected .wallet:hover .logo-fallback {
		transform: none;
	}

	.wallet-row.has-open .wallet {
		padding-inline-end: 96px;
	}

	/* The row's own action: a soft pill of the same tint, one step deeper, so it reads as part
	   of the selected surface rather than a link laid on it. No border, no shadow. It arrives
	   just after the tint and leaves with it. */
	.row-open {
		--open-fill: light-dark(
			color-mix(in oklab, var(--bchc-accent) 16%, transparent),
			color-mix(in oklab, var(--bchc-accent) 20%, transparent)
		);
		position: absolute;
		inset-block: 0;
		inset-inline-end: var(--bchc-space-3);
		z-index: 1;
		margin-block: auto;
		height: 32px;
		padding-inline: 14px 12px;
		border-radius: var(--bchc-radius-pill);
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--open-fill);
		color: var(--bchc-text);
		font-size: var(--bchc-text-sm);
		font-weight: var(--bchc-weight-bold);
		letter-spacing: 0.01em;
		text-decoration: none;
		white-space: nowrap;
		visibility: hidden;
		opacity: 0;
		transform: scale(0.92);
		transition:
			opacity var(--bchc-duration-fast) var(--bchc-ease-out),
			transform var(--bchc-duration-fast) var(--bchc-ease-out),
			background var(--bchc-duration-fast) var(--bchc-ease-out),
			visibility 0s linear var(--bchc-duration-fast);
	}

	.row-open.is-shown {
		visibility: visible;
		opacity: 1;
		transform: none;
		transition:
			opacity var(--bchc-duration-base) var(--bchc-ease-out) 120ms,
			transform var(--bchc-duration-base) var(--bchc-ease-spring) 120ms,
			background var(--bchc-duration-fast) var(--bchc-ease-out),
			visibility 0s;
	}

	.row-open-text {
		unicode-bidi: plaintext;
	}

	/* Lowered half a pixel: next to mostly lowercase text, the box centre reads high. */
	.row-open-arrow {
		flex: none;
		margin-block-start: 1px;
		color: var(--bchc-accent-text);
		transition: transform var(--bchc-duration-base) var(--bchc-ease-spring);
	}

	.overlay.is-rtl .row-open-arrow {
		scale: -1 1;
	}

	.row-open:hover {
		--open-fill: light-dark(
			color-mix(in oklab, var(--bchc-accent) 24%, transparent),
			color-mix(in oklab, var(--bchc-accent) 28%, transparent)
		);
	}

	.row-open:hover .row-open-arrow {
		transform: translate(1.5px, -1.5px);
	}

	.overlay.is-rtl .row-open:hover .row-open-arrow {
		transform: translate(-1.5px, -1.5px);
	}

	.row-open.is-shown:active {
		transform: scale(0.95);
		transition-delay: 0s;
	}

	.open-wallet:hover svg {
		transform: translate(1px, -1px);
	}

	.open-wallet svg {
		transition: transform var(--bchc-duration-base) var(--bchc-ease-spring);
	}

	/* The chosen wallet in the scan caption: its mark and name, like a session-type mark. Only
	   this part swaps when another wallet is chosen. */
	.caption-wallet {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		vertical-align: bottom;
		margin-inline-start: 2px;
		color: var(--bchc-text);
		font-weight: var(--bchc-weight-semibold);
	}

	.caption-mark,
	.caption-wallet .logo-fallback {
		width: 16px;
		height: 16px;
		flex: none;
		border-radius: 4px;
		object-fit: contain;
	}

	.caption-name {
		unicode-bidi: plaintext;
	}

	.row-open.is-shown[aria-disabled="true"],
	.open-wallet[aria-disabled="true"] {
		opacity: 0.45;
		pointer-events: none;
	}

	@keyframes open-in {
		from {
			opacity: 0;
			transform: translateX(-6px) scale(0.96);
		}
	}

	/* Tabs: no track; only the selected tab has a surface, the same tint, spreading from its mark. */
	.cell-control > .session.is-tabs {
		flex: 1;
		min-width: 0;
	}

	.tabs {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--count), minmax(0, 1fr));
		gap: 2px;
		height: var(--footer-size);
	}

	/* Three full names plus marks need ~396px and the code column has 368: past two, only the
	   active tab spells its name and the others keep their mark (name in title and the
	   accessible name). The name's column opens and closes, so the tabs re-flow fluidly. */
	.tabs.is-dense {
		display: flex;
		gap: var(--bchc-space-1);
	}

	.tabs.is-dense .tab {
		flex: none;
		gap: 0;
		padding: 0 10px;
	}

	.tab {
		--spread-x: 18px;
		position: relative;
		isolation: isolate;
		z-index: 1;
		min-width: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		padding: 0 var(--bchc-space-2);
		border: 0;
		border-radius: var(--bchc-radius-pill);
		background: transparent;
		color: var(--bchc-text-muted);
		font-family: inherit;
		font-size: var(--bchc-text-xs);
		font-weight: var(--bchc-weight-semibold);
		line-height: 1;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background var(--bchc-duration-fast) var(--bchc-ease-out),
			color var(--bchc-duration-base) var(--bchc-ease-out),
			transform var(--bchc-duration-fast) var(--bchc-ease-out);
	}

	.overlay.is-rtl .tab {
		--spread-x: calc(100% - 18px);
	}

	.tab:not([aria-selected="true"]):hover {
		color: var(--bchc-text);
		background: color-mix(in oklab, var(--bchc-text) 5%, transparent);
	}

	.tab:active {
		transform: scale(0.97);
	}

	.tab[aria-selected="true"] {
		/* Text colour, not accent: the tint carries the accent. */
		color: var(--bchc-text);
		cursor: default;
	}

	.tab:focus-visible {
		outline: 2px solid var(--bchc-focus);
		outline-offset: -2px;
	}

	.tab-mark {
		width: 16px;
		height: 16px;
		flex: none;
		border-radius: 4px;
		object-fit: contain;
		/* Own colours, slightly receded: greyscale lost dark marks (WizardConnect) on dark. */
		opacity: 0.78;
		transition: opacity var(--bchc-duration-base) var(--bchc-ease-out);
	}

	.tab:hover .tab-mark,
	.tab[aria-selected="true"] .tab-mark {
		opacity: 1;
	}

	/* The name sits in a grid column that animates between 0fr and 1fr. */
	.tab-name {
		display: grid;
		grid-template-columns: 1fr;
		min-width: 0;
		margin-inline-start: 6px;
		transition:
			grid-template-columns var(--bchc-duration-base) var(--bchc-ease-settle),
			margin var(--bchc-duration-base) var(--bchc-ease-settle);
	}

	.tabs:not(.is-dense) .tab-name {
		margin-inline-start: 0;
	}

	/* Clipped, not ellipsised: while the column opens the name is revealed, never dotted.
	   Each name keeps its own direction, so an RTL page doesn't move its letters. */
	.tab-name-inner {
		min-width: 0;
		overflow: hidden;
		text-overflow: clip;
		white-space: nowrap;
		unicode-bidi: plaintext;
		transition: opacity var(--bchc-duration-fast) var(--bchc-ease-out);
	}

	.tabs.is-dense .tab:not([aria-selected="true"]) .tab-name {
		grid-template-columns: 0fr;
		margin-inline-start: 0;
	}

	.tabs.is-dense .tab:not([aria-selected="true"]) .tab-name-inner {
		opacity: 0;
		transition-duration: calc(var(--bchc-duration-fast) * 0.6);
	}

	/* One session type: an informational label where the tabs would be. */
	.session.is-info {
		display: flex;
		align-items: center;
		gap: var(--bchc-space-3);
		min-width: 0;
	}

	.session-value {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		color: var(--bchc-text);
		font-size: var(--bchc-text-xs);
		font-weight: var(--bchc-weight-semibold);
		white-space: nowrap;
	}

	.session-value .tab-mark {
		opacity: 1;
	}

	/* Under the code, the session-type menu opens upwards over the tile. */
	.menu.is-up {
		top: auto;
		bottom: calc(100% + var(--bchc-space-1));
		transform-origin: 12px 100%;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--bchc-space-2);
		flex: none;
	}

	.button.icon-only {
		width: var(--footer-size);
		padding: 0;
	}

	.open-wallet {
		animation: open-in var(--bchc-duration-base) var(--bchc-ease-settle) both;
	}

	@media (prefers-reduced-motion: reduce) {
		.row-open,
		.open-wallet {
			transition: none;
			animation: none;
		}
	}

	@media (forced-colors: active) {
		.wallet-row.is-selected .wallet,
		.tab[aria-selected="true"] {
			border: 2px solid Highlight;
		}
	}
`;
