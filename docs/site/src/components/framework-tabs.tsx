import { Tabs } from "fumadocs-ui/components/tabs";
import type { ReactNode } from "react";

/** Frameworks every guide sample is written for (CONVENTIONS §8). */
export const frameworks = ["Vanilla", "React", "Vue"];

/**
 * Framework switcher for guide samples. The choice is shared by every
 * switcher on the site and persisted in localStorage.
 *
 * @example
 * <FrameworkTabs>
 *   <Tab value="Vanilla">…</Tab>
 *   <Tab value="React">…</Tab>
 *   <Tab value="Vue">…</Tab>
 * </FrameworkTabs>
 */
export function FrameworkTabs({ children }: { children: ReactNode }) {
	return (
		<Tabs groupId="framework" items={frameworks} persist>
			{children}
		</Tabs>
	);
}
