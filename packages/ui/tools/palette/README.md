# Palette tool

Generates the BCH Connect colour system: eight curated accents, four neutral
families, and two fixed status hues (warning, danger), each resolved to twelve
steps under the Radix Colors step contract, in light and dark mode.

## Commands

```bash
pnpm palette         # recipes -> stylesheet, types, proof manifest
pnpm palette:check   # WCAG gate over every accent x neutral x mode
pnpm check           # includes the gate
```

Open `proof.html` in a browser to see the result: light and dark side by side,
all eight accents, and real UI fragments rather than swatches.

## Files

| File          | Role                                                 |
| ------------- | ----------------------------------------------------|
| `recipes.ts`  | Source of truth. Every recipe, ladder and semantic mapping. |
| `palette.ts`  | Resolves recipes into `colorjs.io` colours. Knows nothing about CSS. |
| `generate.ts` | Resolves colours into the three generated artifacts. |
| `check.ts`    | The contrast and monotonic-lightness gate.           |
| `apcach.d.ts` | Hand-written types for `apcach`, which ships none.   |
| `proof.html`  | Renders the generated palette for visual review.     |

Generated, never edited by hand:

- `../../src/styles/theme.generated.css` — the stylesheet the library ships
- `../../src/theme.generated.ts` — the same enums as TypeScript unions
- `proof.data.generated.js` — the proof page's manifest

`test/generated.test.ts` rebuilds all three from `recipes.ts` and fails if the
committed copies have drifted.

## The twelve steps

Radix Colors' step contract, not their colours.

| Step | Role                                     |     | Step | Role                       |
| ---- | ----------------------------------------- | --- | ---- | --------------------------- |
| 1    | App background                            |     | 7    | UI element border           |
| 2    | Subtle background                         |     | 8    | Hovered UI element border    |
| 3    | UI element background                     |     | 9    | Solid                        |
| 4    | Hovered UI element background             |     | 10   | Hovered solid                |
| 5    | Active / selected UI element background   |     | 11   | Low-contrast text            |
| 6    | Subtle border                             |     | 12   | High-contrast text           |

Step 9 is the one authored colour. Steps 1–8 and 10 come from an authored
lightness/chroma ladder (`LIGHT_LADDER`, `DARK_LADDER` in `recipes.ts`); steps
11 and 12 are solved for contrast (see below). The ladder is monotonic: light
mode runs lightest (step 1) to darkest (step 12), dark mode the reverse.
`check.ts` gates on this ordering.

## Contrast rules

- Steps 11 and 12 are solved against step 3, not step 2: `accentText` (step
  11) renders on `accentSubtle` (step 3), and solving against step 2 leaves
  that pair under the ratio once it is actually on screen. Satisfying step 3
  satisfies step 2 for free.
- The focus ring is solved separately, against step 1, at 3:1 (WCAG 1.4.11).
  It is not placed on the ladder, because forcing a ladder step to carry that
  constraint breaks the ladder's monotonic lightness. It is defined in
  `ACCENT_DERIVED`.
- Every accent solves its own foreground colour against its solid (step 9)
  rather than assuming white or black text, because some accents (BCH green
  among them, at 2.33:1 against white) fail contrast against a fixed label
  colour.
- Text pairs (`text`, `textMuted`, `accentText`, the status `*Text` tokens)
  gate at 4.5:1 (WCAG 1.4.3, normal text). The focus ring gates at 3:1 (WCAG
  1.4.11, non-text UI).
- `check.ts` checks the full accent × neutral × mode cross product, not just
  each accent's default neutral pairing, because the pairing is an
  overridable default: a combination nobody would pick by default is still
  one a developer can ship.
- WCAG 2.x ratios are the pass/fail gate. APCA Lc is computed and printed
  alongside for reference; it fails nothing, since WCAG 3.0 is still a
  Working Draft and no shipped accessibility standard normatively references
  APCA.

## Adding an accent

One line in `ACCENTS` (`recipes.ts`):

```ts
{ name: "teal", hue: 195, chroma: 0.13, solidLightness: 0.7, neutral: "sage" },
```

Then run `pnpm palette && pnpm palette:check`. No component CSS changes are
needed, because components reference steps, not colours. The gate reports
whether the hue can carry its text steps.

`solidLightness` takes a single number when the solid is a brand colour that
should be identical in both modes, a `{ light, dark }` pair when it is a rung
on the ladder rather than a brand (as the neutrals are), or `"contrast"` for
an achromatic scale whose solid is its darkest step (`ink`).

## Adding a neutral

One line in `NEUTRALS` (`recipes.ts`), with a small chroma at the hue family
it should pair with:

```ts
{ name: "stone", hue: 40, chroma: 0.014, solidLightness: { light: 0.62, dark: 0.6 } },
```

Pair it to an accent by default through that accent's `neutral` field, or
leave it as an override a consumer selects with `data-bchc-neutral`.

## Knobs

Each maps to a `data-bchc-*` attribute on the modal host.

| Attribute           | Values                                                  |
| ------------------- | -------------------------------------------------------- |
| `data-bchc-accent`  | green · cyan · blue · violet · pink · red · amber · ink  |
| `data-bchc-neutral` | sage · slate · sand · pure                               |
| `data-bchc-radius`  | none · small · medium · large · full                     |
| `data-bchc-font`    | brand · system · mono                                    |
| `data-bchc-blur`    | none · small · large                                     |
| `data-bchc-mode`    | auto · light · dark                                      |

`data-bchc-radius` maps each preset to an explicit value per role (modal,
tile, row, control, pill, media) rather than one value times a scalar,
because a single multiplier that suits a pill breaks a larger panel.

`data-bchc-mode` sets `color-scheme`, which `light-dark()` reads, so light and
dark share one CSS declaration per token instead of the stylesheet carrying
every scale twice.

## What the gate does not prove

`check.ts` confirms the generated colours clear their contrast floors and
that every ladder is monotonic. It cannot confirm *why* they pass: a refactor
that stopped honouring `solidLightness` could still emit colours that happen
to clear contrast by coincidence. `../../test/palette.test.ts` covers that by
asserting behaviour against the recipes directly.

## Open

- Shipping the brand font. The face is Plus Jakarta Sans; `brand` resolves
  through `--bchc-font-brand-family`, set by the library when it injects
  `@font-face` at document level (Shadow DOM cannot declare fonts). Until that
  injection ships, `brand` falls back to the system stack.
- Whether all four neutrals earn their place against the accents in the proof
  page.
