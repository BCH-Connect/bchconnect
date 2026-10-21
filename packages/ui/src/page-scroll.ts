// Shared by every modal, so overlapping ones can't restore each other's lock: the first lock
// saves the page's own inline values and the last unlock restores them.
let pageScrollLocks = 0;
let savedOverflow = "";
let savedScrollbarGutter = "";

/** Stops the page behind the modal from scrolling. @internal */
export function lockPageScroll(): void {
	pageScrollLocks += 1;
	if (pageScrollLocks > 1) return;
	const root = document.documentElement;
	savedOverflow = root.style.overflow;
	savedScrollbarGutter = root.style.scrollbarGutter;
	// Measured before hiding overflow, which would itself remove the scrollbar.
	const hasScrollbar = innerWidth - root.clientWidth > 0;
	root.style.overflow = "hidden";
	if (hasScrollbar) root.style.scrollbarGutter = "stable";
}

/** Releases one {@link lockPageScroll}. @internal */
export function unlockPageScroll(): void {
	pageScrollLocks -= 1;
	if (pageScrollLocks > 0) return;
	const root = document.documentElement;
	root.style.overflow = savedOverflow;
	root.style.scrollbarGutter = savedScrollbarGutter;
}
