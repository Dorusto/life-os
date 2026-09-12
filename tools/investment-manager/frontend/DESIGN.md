# investment-manager — design system

This file documents the visual language so it can be **ported to
`majordom-financiar` and `vehicle-manager`** later (section 6 of the build
plan: unify the platform's look once this app's design is proven). It is
deliberately short — the actual decisions live in code, in exactly two places:

- `src/styles/tokens.css` — all color, type, radius and elevation values as
  CSS custom properties.
- `tailwind.config.js` — maps Tailwind's theme onto those properties, plus the
  display type ladder.

There is no other place a color or font value should be written. If a
component needs a new value, add a token first.

## The idea

A personal investment ledger should read like a well-set annual report, not a
trading terminal and not a generic SaaS dashboard. The design's job is to make
long-horizon numbers trustworthy and calm: one confident figure, figures that
line up in columns, and only two colors that carry meaning — brand blue for
structure, green/red strictly for gain/loss.

The recurring structural motif is a **fine double rule** (`.statement-rule`)
used once, at the top of the dashboard's headline panel. That is the single
"statement" gesture; everything around it stays quiet.

## Palette

Cool, slightly blue-gray paper rather than the warm cream (#F4F1EA-ish) that
generated dashboards default to. Ink is a blue-black, and the brand is a deep
naval blue — deliberately **not** money-green, so green is reserved for gains
and can never be mistaken for chrome.

| token | value | role |
| --- | --- | --- |
| `--paper` | `#EEF1F3` | page background |
| `--surface` | `#FFFFFF` | cards, inputs, modals |
| `--surface-2` | `#F4F7F8` | hover / nested surfaces |
| `--ink` | `#101B26` | primary text and figures |
| `--ink-2` | `#4A5A66` | secondary text |
| `--ink-3` | `#64737D` | tertiary / captions |
| `--line` | `#DCE3E7` | default border |
| `--brand` | `#1F4166` | primary actions, active nav |
| `--brand-soft` | `#E1EAF3` | active nav background, focus ring |
| `--gain` / `--gain-soft` | `#177D52` / `#E0F0E8` | positive changes |
| `--loss` / `--loss-soft` | `#B23B34` / `#F6E4E2` | negative changes |
| `--warn` / `--warn-soft` | `#8A6414` / `#F4ECD8` | drift, "behind target" |

Six categorical series colors (`--c1`…`--c6`, navy / teal / ochre / plum /
steel / rose) are used in that fixed order for allocation slices — navy always
first, so the largest slice reads as "the portfolio" rather than a random hue.

## Typography

Two faces, each with one job:

- **IBM Plex Sans** — all prose and UI. A humanist sans with a slightly
  technical, engineered character that suits a financial tool without shouting.
- **IBM Plex Mono** — every number, ticker, date and percentage, via the
  `.tnum` tabular-figures utility. Setting figures in mono is the deliberate
  ledger choice here: columns of amounts align digit-for-digit, which is the
  whole point of a holdings table.

Both are self-hosted through `@fontsource` (latin + latin-ext, so Romanian
diacritics render) — no runtime Google Fonts request, so the app works on a
private network. The display ladder is `text-display` / `text-display-sm`,
tightly tracked; body sizes stay on Tailwind's defaults.

## Layout & components

- Desktop is a fixed 248px left rail (brand, nav, account) with the content in
  a centered max-width column. Mobile collapses the rail into a top bar plus a
  slide-over drawer; there is no bottom nav.
- Cards share one radius, one hairline border and one very soft shadow. Radius
  and shadow are **not** varied per level — hierarchy comes from spacing and
  the statement band, not from increasingly round, shadowed boxes (the
  "SaaS-card kit" tell).
- Charts are dependency-free SVG (`LineChart`, `DonutChart`, `BarList`) and
  take their colors from the same CSS variables, so porting the palette
  automatically re-skins every chart.
- Copy is sentence case, plain verbs, and names things by what the user
  manages ("Add transaction", "Suggested trade"), never by system internals.
  Errors say what happened and what to do next. Labels are never set in
  tracked-out all-caps.

## Porting checklist

1. Copy `src/styles/tokens.css` and the `theme.extend` block from
   `tailwind.config.js` into the target app.
2. Add the four IBM Plex Sans weights + three mono weights via `@fontsource`.
3. Reuse `components/` primitives (Button, Card, Form, Modal, Feedback, Pill,
   Delta, MetricTile, Segmented, charts) as-is — they reference only tokens.
4. Swap the categorical palette only if the domain needs different semantics;
   keep the six-value, fixed-order contract.
