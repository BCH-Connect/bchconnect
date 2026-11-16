import { useState } from "react";
import { useRoving } from "../../hooks/use-roving";
import { CodeWindow, c, f, k, s, t } from "./code-window";

const TABS = ["JavaScript", "React", "SSR"] as const;
type Tab = (typeof TABS)[number];

/** Plain usage of the client, and the React binding as docs/SPEC.md §7.9–7.10 plans it. */
function Snippet({ tab }: { readonly tab: Tab }) {
	if (tab === "SSR") {
		return (
			<>
				{c("// @bchconnect/react is not built yet")}
				{"\n"}
				{k("import")} {"{ "}
				{f("useState")}
				{" } "}
				{k("from")} {s('"react"')};{"\n"}
				{k("import")} {"{ "}
				{t("BchConnectProvider")}
				{" } "}
				{k("from")} {s('"@bchconnect/react"')};{"\n"}
				{k("import")} {"{\n  "}
				{f("cookieStorage")},{"\n  "}
				{f("cookieToInitialState")},{"\n  "}
				{f("createClient")},{"\n} "}
				{k("from")} {s('"@bchconnect/core"')};{"\n\n"}
				{c("// Server, per request")}
				{"\n"}
				{k("const")} initialState = {f("cookieToInitialState")}({"\n  "}
				{f("createClient")}(config),{"\n  "}
				request.headers.{f("get")}({s('"cookie"')}) ?? {k("undefined")},
				{"\n);\n\n"}
				{c("// Server render and browser, from that initialState")}
				{"\n"}
				{k("function")} {f("Providers")}({"{ "}initialState, children{" }"}){" "}
				{"{\n  "}
				{k("const")} [client] = {f("useState")}(() {k("=>")}
				{"\n    "}
				{f("createClient")}({"{\n      "}...config,{"\n      "}ssr: {k("true")},
				{"\n      "}storage: {f("cookieStorage")}(),{"\n      "}
				initialState,{"\n    }),\n  );\n  "}
				{k("return")} ({"\n    <"}
				{t("BchConnectProvider")} client={"{"}client{"}"}
				{">\n      {"}children{"}\n    </"}
				{t("BchConnectProvider")}
				{">\n  );\n}"}
			</>
		);
	}
	if (tab === "React") {
		return (
			<>
				{c("// @bchconnect/react is not built yet")}
				{"\n"}
				{k("import")} {"{ "}
				{f("useConnect")}, {f("useSession")}
				{" } "}
				{k("from")} {s('"@bchconnect/react"')};{"\n\n"}
				{k("function")} {f("Wallet")}() {"{\n  "}
				{k("const")} session = {f("useSession")}();{"\n  "}
				{k("const")} {"{ "}connect, pending{" }"} = {f("useConnect")}();
				{"\n\n  "}
				{k("if")} (session) {k("return")} {"<"}
				{t("p")}
				{">{"}session.wallet.name{"}</"}
				{t("p")}
				{">;\n  "}
				{k("return")} ({"\n    <"}
				{t("button")} disabled={"{"}pending{"}"} onClick={"{"}() {k("=>")}{" "}
				{f("connect")}(){"}>"}
				{"\n      "}Connect{"\n    </"}
				{t("button")}
				{">\n  );\n}"}
			</>
		);
	}
	return (
		<>
			{k("await")} client.{f("init")}();{"\n\n"}
			client.{f("on")}({s('"session:connected"')}, ({"{ "}session{" }"}){" "}
			{k("=>")} {"{\n  "}
			console.{f("log")}(session.wallet.name);{"\n});\n\n"}
			client.{f("on")}({s('"session:disconnected"')}, ({"{ "}reason{" }"}){" "}
			{k("=>")} {"{\n  "}
			console.{f("log")}(reason);{"\n});\n\n"}
			{k("const")} session = {k("await")} client.{f("connect")}();
		</>
	);
}

export function Frameworks() {
	const [tab, setTab] = useState<Tab>("JavaScript");
	const roving = useRoving(TABS, tab, setTab);

	return (
		<CodeWindow
			tabs={TABS.map((id) => ({ id, label: id }))}
			active={tab}
			onTabKeyDown={roving.onKeyDown}
			tabProps={roving.item}
			label="Framework"
		>
			<span key={tab} className="swap-block">
				<Snippet tab={tab} />
			</span>
		</CodeWindow>
	);
}
