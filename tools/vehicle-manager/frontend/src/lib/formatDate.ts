/**
 * Date formatting — the single place a date becomes display text on a page.
 *
 * Copied (trimmed to the one function this app needs) from
 * majordom-financiar/frontend/src/lib/formatDate.ts (2026-09-12) — that file's
 * own history is a cautionary tale about locale mistakes (see its own
 * comment), so reuse its already-corrected 'en-GB' locale rather than
 * re-deriving one.
 */

const LOCALE = 'en-GB'

/**
 * Format a date as `30 Aug 2026`. Accepts an ISO string/datetime, `null`/`undefined` (renders
 * as `—`), or an invalid string (renders as-is, same fallback the original duplicated call
 * sites used).
 */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
}
