// `HTMLElement` where it exists, else a stand-in: extending it evaluates at
// module load and throws where the global doesn't exist (SSR, build, tests).
// The fallback is never instantiated; only register.ts calls customElements.define.
export const ElementBase: typeof HTMLElement = (globalThis.HTMLElement ??
	class {}) as typeof HTMLElement;
