/**
 * Single source of truth for chart/list item colors.
 *
 * The palette reads from the design tokens (src/styles/tokens.css) rather than
 * hardcoded hex, so re-valuing a token re-skins every chart with no per-chart
 * work — the same contract investment-manager's charts follow. The six
 * categorical colors are consumed in fixed order (--c1 first), so the largest
 * slice always reads as "the primary series" rather than a random hue; see
 * DESIGN.md's palette section.
 *
 * Note: these are `var(...)` strings, so they must be applied as a style
 * (e.g. `style={{ stroke: color }}`), not as an SVG presentation attribute —
 * `var()` does not resolve in presentation attributes.
 */
export const CHART_PALETTE = [
  'var(--c1)', // navy
  'var(--c2)', // teal
  'var(--c3)', // ochre
  'var(--c4)', // plum
  'var(--c5)', // steel
  'var(--c6)', // rose
]

// Fixed semantic color for income — distinct from the categorical palette,
// deliberately not hashed (income isn't "a category" competing for a slot).
export const INCOME_COLOR = 'var(--gain)'

/**
 * Deterministic hash so the same key (category/group/goal name or id)
 * always resolves to the same palette color everywhere it's used, instead
 * of depending on a widget's own sort order or filtering.
 */
export function colorForKey(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  return CHART_PALETTE[Math.abs(hash) % CHART_PALETTE.length]
}
