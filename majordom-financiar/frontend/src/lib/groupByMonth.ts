/**
 * Groups an already date-sorted (newest first) list into month buckets,
 * each carrying a net total — used by Transactions and Account Detail to
 * show a month header + monthly summary instead of one long flat list.
 * See docs/glm-5.3/ui-audit-2026-08-30.md §5 item #14.
 */
export interface MonthGroup<T> {
  /** e.g. "August 2026" */
  label: string
  items: T[]
  /** Sum of getAmount() across the group's items — a net income/expense total. */
  total: number
}

export function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => string,
  getAmount: (item: T) => number
): MonthGroup<T>[] {
  // Map preserves insertion order, so groups come out in the same
  // (already-sorted) order as the input — no re-sort needed.
  const groups = new Map<string, MonthGroup<T>>()

  for (const item of items) {
    const d = new Date(getDate(item))
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let group = groups.get(key)
    if (!group) {
      group = { label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), items: [], total: 0 }
      groups.set(key, group)
    }
    group.items.push(item)
    group.total += getAmount(item)
  }

  return [...groups.values()]
}
