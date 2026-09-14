/**
 * Date formatting — the single place a date becomes display text on a page
 * (as opposed to a chart axis label, which has its own compact needs — see
 * `Chart.tsx`'s `formatDateShort`/`formatDateFull`).
 *
 * Why this file exists:
 * Nine call sites duplicated `toLocaleDateString(...)` inline, split across three different
 * locale strings for the same shapes — 'en-GB' (5 sites), 'en-NL' (3 sites), and 'nl-NL'
 * (1 site, `VehicleDetail.tsx`). The first two render identically for every format used here;
 * the third doesn't — it produced genuinely Dutch text ("30 aug 2026", "augustus") in an
 * otherwise English UI, not a deliberate choice, just `formatCurrency.ts`'s `LOCALE` constant
 * copied for the wrong purpose. See issue #237.
 *
 * Locale fixed at 'en-GB' — the more common of the two English locales already in use.
 *
 * Never format a date inline. If a call site needs a shape this doesn't cover, add a function
 * here rather than reaching for toLocaleDateString again.
 */

const LOCALE = 'en-GB'

/**
 * Format a date as `30 Aug 2026`. Accepts an ISO string/datetime, `null`/`undefined` (renders
 * as `—`), or an invalid string (renders as-is, same fallback the duplicated call sites used).
 */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Format a `Date` as a month + year — `August 2026` (style: 'long', default) or `Aug 2026`
 * (style: 'short'). Takes a `Date`, not a string, since callers already build it their own way
 * (a plain `"YYYY-MM"` string has no safe universal parse — day-of-month/timezone assumptions
 * differ by caller) — this only replaces the duplicated formatting tail end.
 */
export function formatMonthYear(date: Date, style: 'long' | 'short' = 'long'): string {
  return date.toLocaleDateString(LOCALE, { month: style, year: 'numeric' })
}

/** Format a `Date` as `Sun 30 Aug` — no year, for a "today" style header. */
export function formatWeekdayDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' })
}
