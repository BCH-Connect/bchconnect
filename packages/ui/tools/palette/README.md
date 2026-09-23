# The colour system

Eight curated accents, four neutrals, two status hues. A developer picks from
these rather than passing a colour, which is what lets the system promise
contrast and keeps the modal recognisable across the dapps that embed it.

Nothing here is a colour someone eyeballed. Each scale is a recipe — a hue, a
chroma ceiling, one authored solid — and a ladder that says how the other eleven
steps come from it.

## Commands

```bash
pnpm palette         # recipes -> stylesheet, types, proof manifest
pnpm palette:check   # WCAG gate over every accent x neutral x mode
pnpm check           # includes the gate
```

Open `proof.html` in a browser to see the result: light and dark side by side,
all eight accents at once, and real fragments rather than swatches.

## Files

| | |
|---|---|
| `recipes.ts` | **The source of truth.** Every decision lives here. |
| `palette.ts` | Recipes → colours. Knows nothing about CSS. |
| `generate.ts` | Colours → the three generated artifacts. |
| `check.ts` | The gate. Exits non-zero on failure. |
| `apcach.d.ts` | Hand-written types for apcach, which ships none. |
| `proof.html` | What you look at. |

Generated, never edited by hand:

- `../../src/styles/theme.generated.css` — the stylesheet the library ships
- `../../src/theme.generated.ts` — the same enums as TypeScript unions
- `proof.data.generated.js` — the proof page's manifest

A test rebuilds all three and fails if the committed copies have drifted.

## Adding an accent

One line in `ACCENTS`:

```ts
{ name: "teal", hue: 195, chroma: 0.13, solidLightness: 0.7, neutral: "sage" },
```

Then `pnpm palette && pnpm palette:check`. No component CSS changes, because
components reference steps rather than colours. The gate will tell you if the
hue cannot carry its text steps, and the tests will tell you if it lands too
close to a neighbour.

`solidLightness` takes a single number when the solid is a brand colour that
should be identical in both modes, a `{ light, dark }` pair when it is a rung on
the ladder rather than a brand, or `"contrast"` for an achromatic scale whose
solid *is* its darkest step — that is what `ink` is.

## The twelve steps

The step semantics are Radix Colors'. We took the contract, not the colours.

| Step | Role | | Step | Role |
|---|---|---|---|---|
| 1 | App background | | 7 | Border |
| 2 | Subtle background | | 8 | Hovered border |
| 3 | UI element background | | 9 | **Solid** |
| 4 | Hovered UI background | | 10 | Hovered solid |
| 5 | Active / selected | | 11 | Low-contrast text |
| 6 | Subtle border | | 12 | High-contrast text |

This is the whole reason a curated set stays maintainable as it grows: a
component writes `var(--bchc-accent-3)` for a resting surface and
`var(--bchc-accent-4)` for its hover exactly once, and it is then correct for
every accent, in both modes, forever.

**Steps 11 and 12 are solved, not drawn.** They are given a contrast ratio
against step 3 and the solver finds the lightness that hits it. Step 3 rather
than step 2 — which is what Radix guarantees — because `accent-text` is rendered
on `accent-subtle`, which *is* step 3; solving against step 2 leaves the pair at
roughly 4.4:1 once it is actually on screen. Satisfying step 3 satisfies 1 and 2
for free.

**The focus ring is not a step.** It needs 3:1 against the surface, and forcing
a ladder position to carry that constraint dragged step 7 darker than the solid
at step 9, which broke the ladder's monotonic lightness. It lives in
`ACCENT_DERIVED` with its own constraint instead.

**Every accent carries its own foreground.** Bitcoin Cash green sits at 2.33:1
against white, so a system that assumed white button labels would ship a default
that fails AA. RainbowKit shipped seven curated accents and still had to delete
one post-release for exactly this.

## The knobs

Each maps to a `data-bchc-*` attribute on the modal host.

| Attribute | Values |
|---|---|
| `data-bchc-accent` | green · cyan · blue · violet · pink · red · amber · ink |
| `data-bchc-neutral` | sage · slate · sand · pure |
| `data-bchc-radius` | none · small · medium · large · full |
| `data-bchc-font` | brand · system · mono |
| `data-bchc-blur` | none · small · large |
| `data-bchc-mode` | auto · light · dark |

Each accent is paired with a neutral by default, so `data-bchc-neutral` is an
override rather than a required choice. Radix's justification for pairing a
tinted grey to an accent is explicitly aesthetic — "the difference is subtle",
their words, with no accessibility claim attached — which is why it is a default
someone can override rather than a law.

Radius is a table with an explicit value per role, not one ramp times a scalar.
Radix again: "the resulting border-radius is contextual and differs depending on
the component". A multiplier that pills a button balloons the card.

Mode is `color-scheme`, because that is what `light-dark()` reads. Light and
dark share one declaration instead of the stylesheet carrying every scale twice.

## What the gate proves, and what it doesn't

`check.ts` runs 656 contrast pairs across the full accent × neutral × mode cross
product — not the eight expected pairings, because the pairing is a default a
developer can override, and a combination nobody would choose is still one
somebody will ship. It also checks every ladder for monotonic lightness.

WCAG 2.x ratios are the gate. APCA Lc is printed beside them but fails nothing:
WCAG 3.0 is a Working Draft whose own text says its contrast algorithm "is yet
to be determined", and none of Primer, Carbon, Atlassian, Spectrum or Material 3
gate on APCA.

What it cannot tell you is *why* it passes. A refactor that stopped honouring
`solidLightness` could still emit colours that happen to clear contrast. That is
what `../../test/palette.test.ts` is for.

## Open

- The brand font. `brand` resolves through `--bchc-font-brand-family`, which the
  library sets when it injects the `@font-face` at document level, since Shadow
  DOM cannot declare fonts. Until a face is chosen it falls back to the system
  stack — deliberately, because the layout has to survive that fallback anyway.
- Whether four neutrals all earn their place. Radix ships six and calls the
  difference subtle; any that cannot justify itself in the proof page gets cut.
