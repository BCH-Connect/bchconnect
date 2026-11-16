import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/landing";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "BCH Connect — connect every Bitcoin Cash wallet" },
			{
				name: "description",
				content:
					"BCH Connect is one typed client for WizardConnect, WalletConnect and CashConnect, with a connect modal ready to ship.",
			},
		],
	}),
	component: Landing,
});
