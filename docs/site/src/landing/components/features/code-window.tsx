import type { KeyboardEvent, ReactNode } from "react";

/** Token classes for hand-written snippets, coloured as Dracula colours them. */
export const k = (text: string) => <span className="tk-key">{text}</span>;
export const s = (text: string) => <span className="tk-str">{text}</span>;
export const f = (text: string) => <span className="tk-fn">{text}</span>;
export const t = (text: string) => <span className="tk-type">{text}</span>;
export const n = (text: string) => <span className="tk-const">{text}</span>;
export const c = (text: string) => <span className="tk-com">{text}</span>;

interface Tab<Id extends string> {
	readonly id: Id;
	readonly label: string;
}

interface CodeWindowProps<Id extends string> {
	/** One file's name, or several files as tabs. */
	readonly file?: string;
	readonly tabs?: readonly Tab<Id>[];
	readonly active?: Id;
	readonly onSelect?: (id: Id) => void;
	readonly onTabKeyDown?: (event: KeyboardEvent) => void;
	readonly tabProps?: (id: Id) => object;
	readonly label?: string;
	readonly children: ReactNode;
	readonly className?: string;
}

/** An editor window: a title bar with the file's name or its file tabs, then the code. */
export function CodeWindow<Id extends string>({
	file,
	tabs,
	active,
	onTabKeyDown,
	tabProps,
	label,
	children,
	className,
}: CodeWindowProps<Id>) {
	return (
		<figure className={`code-window ${className ?? ""}`}>
			<div className="code-window-bar">
				<span className="code-window-dots" aria-hidden="true">
					<i />
					<i />
					<i />
				</span>
				{tabs === undefined ? (
					<figcaption className="code-window-file">{file}</figcaption>
				) : (
					<div
						role="tablist"
						aria-label={label}
						className="code-window-tabs"
						onKeyDown={onTabKeyDown}
					>
						{tabs.map((tab) => (
							<button
								key={tab.id}
								{...tabProps?.(tab.id)}
								role="tab"
								aria-selected={active === tab.id}
								className="code-window-tab"
							>
								{tab.label}
							</button>
						))}
					</div>
				)}
			</div>
			<pre className="code-window-body">
				<code>{children}</code>
			</pre>
		</figure>
	);
}
