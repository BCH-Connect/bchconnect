import { LogOut } from "lucide-react";
import type { Ref } from "react";
import { CONNECT } from "../content";
import type { ConnectStatus, DemoSession } from "../hooks/use-connect-demo";
import { CopyButton } from "./copy-button";

interface ConnectControlProps {
	readonly ref: Ref<HTMLButtonElement>;
	readonly status: ConnectStatus;
	readonly session: DemoSession | null;
	readonly onOpen: () => void;
	readonly onPreload: () => void;
	readonly onDisconnect: () => void;
}

/** `bitcoincash:qzm5ct…e7rs`, the way apps show an address in a header. */
function shorten(address: string): string {
	const body = address.slice(address.indexOf(":") + 1);
	return `${body.slice(0, 6)}…${body.slice(-4)}`;
}

/** What a dapp puts in its header: a connect button, then the connected account. */
export function ConnectControl({
	ref,
	status,
	session,
	onOpen,
	onPreload,
	onDisconnect,
}: ConnectControlProps) {
	if (status === "connected" && session !== null) {
		return (
			<div className="account">
				<p className="sr-only" role="status">
					{CONNECT.connectedTo(session.walletName)}
				</p>
				<img
					className="account-logo"
					src={session.walletLogo}
					alt=""
					width={28}
					height={28}
				/>
				<span className="account-body">
					<span className="account-wallet">{session.walletName}</span>
					<span className="account-address">{shorten(session.address)}</span>
				</span>
				<CopyButton
					ref={ref}
					text={session.address}
					label={CONNECT.copyAddress}
					copiedLabel={CONNECT.addressCopied}
					className="account-action"
				/>
				<button
					type="button"
					className="account-action"
					aria-label={CONNECT.disconnect}
					title={CONNECT.disconnect}
					onClick={onDisconnect}
				>
					<LogOut aria-hidden="true" />
				</button>
			</div>
		);
	}

	return (
		<div className="connect">
			<button
				ref={ref}
				type="button"
				className="connect-button"
				aria-busy={status === "loading" || status === "open"}
				onPointerEnter={onPreload}
				onFocus={onPreload}
				onClick={onOpen}
			>
				<span className="connect-button-live" aria-hidden="true" />
				{CONNECT.action}
			</button>
			{status === "failed" && (
				<p className="connect-failed" role="alert">
					{CONNECT.failed}
				</p>
			)}
		</div>
	);
}
