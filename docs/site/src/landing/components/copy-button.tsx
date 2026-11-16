import { Check, Copy } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { useCopy } from "../hooks/use-copy";

interface CopyButtonProps {
	readonly ref?: Ref<HTMLButtonElement>;
	readonly text: string;
	/** Names what is copied, for example "Copy install command". */
	readonly label: string;
	readonly copiedLabel?: string;
	/** Visible text. Without it the button shows only its icon. */
	readonly children?: ReactNode;
	readonly className?: string;
}

/** Copies `text` and confirms on the button itself. */
export function CopyButton({
	ref,
	text,
	label,
	copiedLabel = "Copied",
	children,
	className,
}: CopyButtonProps) {
	const { copied, copy } = useCopy();
	const Icon = copied ? Check : Copy;

	return (
		<button
			ref={ref}
			type="button"
			className={className}
			data-copied={copied}
			aria-label={children === undefined ? label : undefined}
			onClick={() => void copy(text)}
		>
			<Icon
				className={cn("size-4 shrink-0", copied && "copy-confirm")}
				aria-hidden="true"
			/>
			{children !== undefined && (copied ? copiedLabel : children)}
			<span className="sr-only" aria-live="polite">
				{copied ? copiedLabel : ""}
			</span>
		</button>
	);
}
