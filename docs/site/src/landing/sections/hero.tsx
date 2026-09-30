import { ConnectControl } from "../components/connect-control";
import { HeroCopy } from "../components/hero-copy";
import type { HubState } from "../components/protocol-hub";
import { ProtocolHub } from "../components/protocol-hub";
import { useConnectDemo } from "../hooks/use-connect-demo";

export function Hero() {
	const demo = useConnectDemo();
	const state: HubState =
		demo.status === "connected"
			? "connected"
			: demo.status === "open"
				? "connecting"
				: "idle";
	const active =
		state === "connected"
			? (demo.session?.protocol ?? null)
			: state === "connecting"
				? demo.protocol
				: null;

	return (
		<section className="hero landing-container">
			<HeroCopy />
			<div className="hero-demo">
				<ProtocolHub state={state} active={active} />
				<ConnectControl
					ref={demo.controlRef}
					status={demo.status}
					session={demo.session}
					onOpen={() => void demo.open()}
					onPreload={demo.preload}
					onDisconnect={demo.disconnect}
				/>
			</div>
		</section>
	);
}
