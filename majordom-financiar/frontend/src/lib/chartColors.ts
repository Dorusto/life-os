import { SERIES_COLORS } from '../components/kit/Charts'

/**
 * Single source of truth for chart/list item colors — previously 4
 * independently hardcoded palettes (`SEGMENT_COLORS` in Chart.tsx,
 * `EXPENSE_COLORS` in Dashboard.tsx, `GROUP_COLORS` in BudgetDashboard.tsx,
 * `GOAL_COLORS` in GoalsSection.tsx) that could assign the same category a
 * different color depending on which widget rendered it, since each picked
 * colors by array position rather than by the item's own identity.
 * See docs/glm-5.3/ui-audit-2026-08-30.md §1.6.
 *
 * The palette is the shared series palette (`var(--c1)`…`var(--c6)`, `--c1`
 * being the app accent), so charts follow the accent picked in
 * Settings → Appearance and resolve correctly in light and dark.
 */
export const CHART_PALETTE = SERIES_COLORS

// Fixed semantic color for income — distinct from the expense palette,
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
