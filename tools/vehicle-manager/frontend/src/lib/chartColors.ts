/**
 * Single source of truth for chart/list item colors.
 * Copied verbatim from majordom-financiar/frontend/src/lib/chartColors.ts
 * (2026-09-12) so the shared Chart.tsx component renders identically here.
 */
export const CHART_PALETTE = [
  '#6366F1', // indigo
  '#22C55E', // green
  '#F59E0B', // amber
  '#EC4899', // pink
  '#14B8A6', // teal
  '#8B5CF6', // violet
  '#F97316', // orange
  '#06B6D4', // cyan
]

// Fixed semantic color for income — distinct from the expense palette,
// deliberately not hashed (income isn't "a category" competing for a slot).
export const INCOME_COLOR = '#EAB308'

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
