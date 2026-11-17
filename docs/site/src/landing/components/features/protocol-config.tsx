import type { ProtocolId } from "@bchconnect/ui";
import { Fragment, useState } from "react";
import { FEATURES, PROTOCOLS } from "../../content";
import { useRoving } from "../../hooks/use-roving";
import { CodeWindow, c, f, k, s } from "./code-window";

type File = "config" | "capabilities";
const FILES: readonly File[] = ["config", "capabilities"];

/**
 * Each protocol's connector package and factory. Only WizardConnect's is
 * settled; the others follow its pattern until their packages ship.
 */
const FACTORIES: Readonly<
	Record<
		ProtocolId,
		{ name: string; args: string; from: string; alsoImport?: string }
	>
> = {
	wizardconnect: {
		name: "wizardConnect",
		args: "",
		from: "@bchconnect/connector-wizardconnect",
	},
	"bch-wc2": {
		name: "walletConnect",
		args: "{ projectId }",
		from: "@bchconnect/connector-walletconnect",
	},
	cashconnect: {
		name: "cashConnect",
		args: "{ template: sendTemplate }",
		alsoImport: "sendTemplate",
		from: "@bchconnect/connector-cashconnect",
	},
};

interface ProtocolConfigProps {
	/** The protocol of the hero's demo session, whose line lights. */
	readonly session: ProtocolId | null;
}

function Config({ session }: ProtocolConfigProps) {
	return (
		<>
			{k("import")} {"{ "}
			{f("createClient")}
			{" } "}
			{k("from")} {s('"@bchconnect/core"')};{"\n"}
			{PROTOCOLS.map((protocol) => {
				const { name, alsoImport, from } = FACTORIES[protocol.id];
				return (
					<Fragment key={protocol.id}>
						{k("import")} {"{ "}
						{f(name)}
						{alsoImport && <>, {f(alsoImport)}</>}
						{" }\n  "}
						{k("from")} {s(`"${from}"`)};{"\n"}
					</Fragment>
				);
			})}
			{"\n"}
			{k("export const")} client = {f("createClient")}({"{\n"}
			{"  network: "}
			{s('"mainnet"')},{"\n"}
			{"  appMetadata,\n"}
			{"  connectors: ["}
			{PROTOCOLS.map((protocol) => {
				return (
					<span
						key={protocol.id}
						className="code-line"
						data-lit={protocol.id === session}
					>
						{"    "}
						{f(FACTORIES[protocol.id].name)}({FACTORIES[protocol.id].args}),
						<span className="code-chip" aria-hidden="true">
							<img src={protocol.mark} alt="" width={14} height={14} />
							{protocol.name}
						</span>
					</span>
				);
			})}
			{"  ],\n});"}
		</>
	);
}

function Capabilities() {
	return (
		<>
			{k("import")} {"{ "}
			{f("signMessage")}
			{" } "}
			{k("from")} {s('"@bchconnect/core"')};{"\n\n"}
			{k("const")} session = client.current;{"\n"}
			{k("if")} (!session) {k("return")};{"\n\n"}
			{c("// Branch on what the session can do, not on its protocol")}
			{"\n"}
			{k("if")} (client.{f("can")}(session, {s('"message-signing"')})) {"{\n  "}
			{k("const")} signature = {k("await")} {f("signMessage")}(client, session,{" "}
			{"{\n    "}
			message: {s('"Hello, world"')},{"\n  });\n}\n\n"}
			{k("await")} client.{f("disconnect")}(session);
		</>
	);
}

/** The client's setup, and how a dapp branches on what a session can do. */
export function ProtocolConfig({ session }: ProtocolConfigProps) {
	const [file, setFile] = useState<File>("config");
	const roving = useRoving(FILES, file, setFile);

	return (
		<CodeWindow
			tabs={FILES.map((id) => ({ id, label: FEATURES.protocols.files[id] }))}
			active={file}
			onTabKeyDown={roving.onKeyDown}
			tabProps={roving.item}
			label="Files"
			className="config-window"
		>
			<span key={file} className="swap-block">
				{file === "config" ? <Config session={session} /> : <Capabilities />}
			</span>
		</CodeWindow>
	);
}
