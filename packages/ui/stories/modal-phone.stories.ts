import { expect, userEvent, waitFor } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { BCHC_MESSAGES_ES } from "../src/locales/es.ts";
import { BCHC_MESSAGES_EN } from "../src/messages.ts";
import { manyDirectory, manyWallets } from "./custom-wallets.ts";
import { viewFor } from "./fixtures.ts";
import {
	expectFailureCopy,
	type ModalStoryArgs,
	modalRender,
	modalShadow,
} from "./modal.ts";
import { settle } from "./settle.ts";
import { THEME_ARG_TYPES } from "./theme.ts";

const meta = preview.type<{ args: ModalStoryArgs }>().meta({
	component: "bchc-modal",
	argTypes: THEME_ARG_TYPES,
	args: { view: viewFor() },
	render: modalRender,
});

/** Fails the story if the viewport global didn't actually land the modal in the sheet breakpoint. */
function expectSheet(canvasElement: HTMLElement): ShadowRoot {
	const shadow = modalShadow(canvasElement);
	expect(shadow.querySelector(".overlay")).toHaveClass("is-sheet");
	return shadow;
}

export const ScanPhone = meta.story({
	globals: { viewport: { value: "phone" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = expectSheet(canvasElement);
		const open = shadow.querySelector('a[data-act="open"]');
		if (!(open instanceof HTMLElement)) throw new Error("open link missing");
		const box = open.getBoundingClientRect();
		expect(box.bottom).toBeLessThanOrEqual(844);
		expect(box.top).toBeGreaterThanOrEqual(0);
	},
});

// Smallest supported width: the code tile shrinks to fit (`#measureSheetRest`
// in modal.ts), so the body should never need to scroll even here.
export const ScanPhoneSmallest = meta.story({
	globals: { viewport: { value: "phoneSmallest" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = expectSheet(canvasElement);
		const body = shadow.querySelector(".body");
		if (!(body instanceof HTMLElement)) throw new Error("body missing");
		expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);
	},
});

export const FailurePhone = meta.story({
	args: { view: viewFor({ phase: { kind: "failed", reason: "rejected" } }) },
	globals: { viewport: { value: "phoneSmall" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = expectSheet(canvasElement);
		const retry = shadow.querySelector('[data-act="retry"]');
		if (!(retry instanceof HTMLElement))
			throw new Error("retry button missing");
		const box = retry.getBoundingClientRect();
		expect(box.bottom).toBeLessThanOrEqual(667);
		expect(box.top).toBeGreaterThanOrEqual(0);
	},
});

// Same failure as `FailurePhone`, in Spanish: the status copy, `lang` and the
// sheet layout all hold at the drawer's own breakpoint.
export const FailurePhoneEs = meta.story({
	args: {
		view: viewFor({ phase: { kind: "failed", reason: "unsupported" } }),
		messages: BCHC_MESSAGES_ES,
	},
	globals: { viewport: { value: "phoneSmall" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = expectSheet(canvasElement);
		expectFailureCopy(canvasElement, "unsupported", BCHC_MESSAGES_ES);
		const overlay = shadow.querySelector(".overlay");
		expect(overlay?.getAttribute("lang")).toBe("es");

		const tile = shadow.querySelector(".tile");
		const title = shadow.querySelector(".status-title");
		const detail = shadow.querySelector(".status-detail");
		if (
			!(tile instanceof HTMLElement) ||
			!(title instanceof HTMLElement) ||
			!(detail instanceof HTMLElement)
		)
			throw new Error("tile, status title or status detail missing");
		const tileBox = tile.getBoundingClientRect();
		const titleBox = title.getBoundingClientRect();
		const detailBox = detail.getBoundingClientRect();
		expect(titleBox.top).toBeGreaterThanOrEqual(tileBox.top - 1);
		expect(titleBox.bottom).toBeLessThanOrEqual(tileBox.bottom + 1);
		expect(detailBox.top).toBeGreaterThanOrEqual(tileBox.top - 1);
		expect(detailBox.bottom).toBeLessThanOrEqual(tileBox.bottom + 1);

		const retry = shadow.querySelector('[data-act="retry"]');
		if (!(retry instanceof HTMLElement))
			throw new Error("retry button missing");
		const box = retry.getBoundingClientRect();
		expect(box.bottom).toBeLessThanOrEqual(667);
		expect(box.top).toBeGreaterThanOrEqual(0);
	},
});

export const WalletsPhone = meta.story({
	args: { view: viewFor({ screen: "wallets" }) },
	globals: { viewport: { value: "phone" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = expectSheet(canvasElement);
		const rows = shadow.querySelectorAll(".directory-row");
		expect(rows.length).toBeGreaterThan(0);
		const card = shadow.querySelector(".card");
		if (!(card instanceof HTMLElement)) throw new Error("card missing");
		expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(390);
	},
});

// `ModalView.wallets` is documented "Shown on a wide viewport only": the
// sheet template never includes the wallet list at all.
export const ManyWalletsHiddenOnPhone = meta.story({
	args: { view: viewFor({ wallets: manyWallets(40) }) },
	globals: { viewport: { value: "phone" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = expectSheet(canvasElement);
		expect(shadow.querySelectorAll(".wallet")).toHaveLength(0);
	},
});

// The directory has no auto-fit like the code tile: a long list genuinely
// overflows a short drawer and must scroll.
export const ManyDirectoryPhoneScrolls = meta.story({
	args: {
		view: viewFor({ screen: "wallets", directory: manyDirectory(40) }),
	},
	globals: { viewport: { value: "phoneSmallest" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = expectSheet(canvasElement);
		const body = shadow.querySelector(".body");
		if (!(body instanceof HTMLElement)) throw new Error("body missing");
		expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
		const rows = shadow.querySelectorAll<HTMLAnchorElement>(".directory-row");
		const last = rows[rows.length - 1];
		if (last === undefined) throw new Error("last directory row missing");
		// Scroll the body directly: focus's implicit scroll-into-view isn't
		// reliable for an off-screen row inside a shadow root.
		body.scrollTop = body.scrollHeight;
		last.focus();
		// `toHaveFocus` reads `document.activeElement`, which stops at the host
		// across a shadow boundary; the shadow root's own `activeElement` is the
		// one that actually tracks focus inside it.
		expect(shadow.activeElement).toBe(last);
		const bodyBox = body.getBoundingClientRect();
		const lastBox = last.getBoundingClientRect();
		expect(lastBox.top).toBeGreaterThanOrEqual(bodyBox.top - 1);
		expect(lastBox.bottom).toBeLessThanOrEqual(bodyBox.bottom + 1);
	},
});

// The "didn't open" hint is about one link: a new session type's link drops it.
export const LinkHintClearsOnNewLink = meta.story({
	globals: { viewport: { value: "phone" } },
	play: async ({ canvasElement }) => {
		await settle();
		const shadow = expectSheet(canvasElement);
		const caption = () =>
			shadow.querySelector(".caption-text")?.textContent?.trim();
		// Keeps the test page from following the wallet link.
		const stay = (event: Event) => event.preventDefault();
		document.addEventListener("click", stay);
		try {
			const open = shadow.querySelector('a[data-act="open"]');
			if (!(open instanceof HTMLElement)) throw new Error("open link missing");
			await userEvent.click(open);
			await waitFor(() => expect(caption()).toBe(BCHC_MESSAGES_EN.linkFailed), {
				timeout: 5000,
			});
		} finally {
			document.removeEventListener("click", stay);
		}
		const tab = shadow.querySelector<HTMLElement>(
			'.tab[data-protocol="walletconnect"]',
		);
		if (tab === null) throw new Error("walletconnect tab missing");
		await userEvent.click(tab);
		await settle();
		expect(caption()).toBe(BCHC_MESSAGES_EN.scan);
	},
});
