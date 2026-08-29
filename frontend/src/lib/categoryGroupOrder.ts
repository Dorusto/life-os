const STORAGE_KEY = 'majordom_category_group_order_v1'

/**
 * Read the user's locally-stored category-group display order.
 *
 * `liveGroupNames` is the full list of groups that exist right now, in their
 * default (non-customized) order.  The stored order (if any) is merged with
 * that live list:
 *
 * - known groups keep their stored relative order
 * - any group not yet in storage is appended in `liveGroupNames` order
 * - any stored name that is no longer in `liveGroupNames` is dropped
 *
 * On any storage failure, or when no preference is saved yet, the function
 * simply returns `liveGroupNames` unchanged.
 */
export function loadGroupOrder(liveGroupNames: string[]): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return liveGroupNames
    const stored = JSON.parse(raw) as unknown
    if (!Array.isArray(stored)) return liveGroupNames

    const known = new Set(liveGroupNames)
    const merged = stored.filter((name): name is string =>
      typeof name === 'string' && known.has(name)
    )
    for (const name of liveGroupNames) {
      if (!merged.includes(name)) merged.push(name)
    }
    return merged
  } catch {
    return liveGroupNames
  }
}

/**
 * Persist the user's category-group display order to localStorage.
 * No-op if storage is unavailable.
 */
export function saveGroupOrder(order: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    // localStorage unavailable (private mode / quota) — reorder preference just won't persist
  }
}
