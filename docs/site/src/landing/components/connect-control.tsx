import { Check, LogOut, PenLine } from "lucide-react";
import type { Ref } from "react";
import { CONNECT, SIGN } from "../content";
import type {
	ConnectStatus,
	LiveSession,
	SignStatus,
} from "../hooks/use-live-connect";
import { CopyButton } from "./copy-button";

interface ConnectControlProps {
	readonly ref: Ref<HTMLButtonElement>;
	readonly status: ConnectStatus;
	readonly session: LiveSession | null;
	readonly onOpen: () => void;
	readonly onPreload: () => void;
	readonly onDisconnect: () => void;
	readonly sign: SignStatus;
	readonly onSign: () => void;
	readonly onCancelSign: () => void;
}

const SIGN_NOTE: Partial<Record<SignStatus, string>> = {
	mismatch: SIGN.mismatch,
	rejected: SIGN.rejected,
	failed: SIGN.failed,
};

/** The one thing to do once connected: a request that round-trips through the wallet. */
function SignRow({
	sign,
	onSign,
	onCancel,
}: {
	readonly sign: SignStatus;
	readonly onSign: () => void;
	readonly onCancel: () => void;
}) {
	if (sign === "signing") {
		return (
			<p className="sign-row" role="status">
				<span className="sign-live" aria-hidden="true" />
				{SIGN.waiting}
				<button type="button" className="sign-action" onClick={onCancel}>
					{SIGN.cancel}
				</button>
			</p>
		);
	}
	if (sign === "verified") {
		return (
			<p className="sign-row" role="status">
				<Check className="sign-check" aria-hidden="true" />
				{SIGN.verified}
				<button type="button" className="sign-action" onClick={onSign}>
					{SIGN.again}
				</button>
			</p>
		);
	}
	const note = SIGN_NOTE[sign];
	return (
		<div className="sign-row">
			{note !== undefined && (
				<span className="sign-note" role="alert">
					{note}
				</span>
			)}
			<button type="button" className="sign-action" onClick={onSign}>
				{note === undefined && (
					<PenLine className="sign-icon" aria-hidden="true" />
				)}
				{note === undefined ? SIGN.action : SIGN.again}
			</button>
		</div>
	);
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
	sign,
	onSign,
	onCancelSign,
}: ConnectControlProps) {
	if (status === "connected" && session !== null) {
		return (
			<div className="connect">
				<div className="account">
					<p className="sr-only" role="status">
						{CONNECT.connectedTo(session.walletName)}
					</p>
					{session.walletLogo !== undefined ? (
						<img
							className="account-logo"
							src={session.walletLogo}
							alt=""
							width={36}
							height={36}
						/>
					) : (
						<span className="account-logo" aria-hidden="true">
							{session.walletName.slice(0, 1)}
						</span>
					)}
					<span className="account-body">
						<span className="account-wallet">{session.walletName}</span>
						<span className="account-address">{shorten(session.address)}</span>
					</span>
					<span className="account-actions">
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
					</span>
				</div>
				{session.canSign && (
					<SignRow sign={sign} onSign={onSign} onCancel={onCancelSign} />
				)}
			</div>
		);
	}

	const disabled = status === "disabled";
	return (
		<div className="connect">
			<button
				ref={ref}
				type="button"
				className="connect-button"
				data-wire="start"
				disabled={disabled}
				title={disabled ? CONNECT.disabledHint : undefined}
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
