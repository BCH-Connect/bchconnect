export function Wordmark() {
	return (
		<span className="inline-flex items-center gap-2.5">
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<rect x="2.5" y="2.5" width="19" height="19" rx="6.5" fill="#08c18e" />
				<path
					d="M9 12h6"
					stroke="#003923"
					strokeWidth="2.2"
					strokeLinecap="round"
				/>
				<circle cx="8" cy="12" r="2.4" fill="#003923" />
				<circle
					cx="16"
					cy="12"
					r="2.4"
					fill="none"
					stroke="#003923"
					strokeWidth="2"
				/>
			</svg>
			<span className="font-bold text-[17px] tracking-[-0.02em]">
				BCH Connect
			</span>
		</span>
	);
}
