import { CodeGlints } from "../components/code-glints";
import { ConnectControl } from "../components/connect-control";
import { HeroCopy } from "../components/hero-copy";
import type { HubState } from "../components/protocol-hub";
import { ProtocolHub } from "../components/protocol-hub";
import type { useLiveConnect } from "../hooks/use-live-connect";

interface HeroProps {
	readonly demo: ReturnType<typeof useLiveConnect>;
}

export function Hero({ demo }: HeroProps) {
	const state: HubState =
		demo.status === "connected"
			? "connected"
			: demo.status === "open"
				? "connecting"
				: "idle";
	const active =
		state === "connected"
			? (demo.session?.protocol ?? null)
			: demo.connectingOver;

	return (
		<section className="hero landing-container">
			<HeroCopy />
			<div className="hero-demo">
				<CodeGlints />
				<ProtocolHub state={state} active={active} />
				<ConnectControl
					ref={demo.controlRef}
					status={demo.status}
					session={demo.session}
					onOpen={() => void demo.open()}
					onPreload={demo.preload}
					onDisconnect={() => void demo.disconnect()}
					sign={demo.sign}
					onSign={() => void demo.signMessage()}
					onCancelSign={demo.cancelSign}
				/>
			</div>
		</section>
	);
}
