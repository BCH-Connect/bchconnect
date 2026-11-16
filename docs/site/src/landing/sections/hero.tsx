import { CodeGlints } from "../components/code-glints";
import { ConnectControl } from "../components/connect-control";
import { HeroCopy } from "../components/hero-copy";
import { ProtocolHub } from "../components/protocol-hub";
import type { useConnectDemo } from "../hooks/use-connect-demo";

interface HeroProps {
	readonly demo: ReturnType<typeof useConnectDemo>;
}

export function Hero({ demo }: HeroProps) {
	return (
		<section className="hero landing-container">
			<HeroCopy />
			<div className="hero-demo">
				<CodeGlints />
				<ProtocolHub state="idle" active={null} />
				<ConnectControl ref={demo.controlRef} onPreload={demo.preload} />
			</div>
		</section>
	);
}
