/**
 * Single source of truth for chart/list item colors — previously 4
 * independently hardcoded palettes (`SEGMENT_COLORS` in Chart.tsx,
 * `EXPENSE_COLORS` in Dashboard.tsx, `GROUP_COLORS` in BudgetDashboard.tsx,
 * `GOAL_COLORS` in GoalsSection.tsx) that could assign the same category a
 * different color depending on which widget rendered it, since each picked
 * colors by array position rather than by the item's own identity.
 * See docs/glm-5.3/ui-audit-2026-08-30.md §1.6.
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
