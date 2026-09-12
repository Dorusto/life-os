/**
 * Currency and number formatting — the single place amounts are turned into text.
 *
 * Copied verbatim from majordom-financiar/frontend/src/lib/formatCurrency.ts
 * (2026-09-12) so the shared Chart.tsx component renders identically here.
 *
 * The convention is European: dot groups thousands, comma separates decimals — €1.234,56.
 * The sign always precedes the currency symbol and uses a true minus (−, U+2212), never a
 * hyphen: −€1.234,56, not €-1234.56.
 *
 * Never format an amount inline. If a call site needs a shape this doesn't cover, add an
 * option here rather than reaching for toFixed/toLocaleString again.
 */

/** European number formatting: 1.234,56 */
const LOCALE = 'nl-NL'

/** U+2212 MINUS SIGN — visually balanced with the digits, unlike a hyphen. */
const MINUS = '−'

export interface CurrencyOptions {
  /**
   * Decimal places. 0 for headline totals, 2 (default) wherever cents matter,
   * 3 for unit prices that are genuinely quoted that way (fuel €/L, cost €/km).
   */
  decimals?: 0 | 2 | 3
  /**
   * - `auto` (default): a minus on negatives, nothing on positives.
   * - `always`: an explicit + on positives — for deltas and transaction amounts.
   * - `never`: magnitude only, when the caller renders its own sign or label.
   */
  signDisplay?: 'auto' | 'always' | 'never'
}

/**
 * Format an amount as euros — `€1.234,56`, `−€235,00`, `+€1.000`.
 *
 * Rounds before deciding the sign, so a value that rounds to zero never renders as `−€0`.
 * A non-finite amount formats as zero rather than "NaN" — a missing number should look
 * empty, not broken.
 */
export function formatCurrency(amount: number, options: CurrencyOptions = {}): string {
  const { decimals = 2, signDisplay = 'auto' } = options

  const safe = Number.isFinite(amount) ? amount : 0
  // Round first: -0.004 at 0 decimals is zero, and must not keep its minus sign.
  const factor = 10 ** decimals
  const rounded = Math.round(safe * factor) / factor

  const body = Math.abs(rounded).toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  let prefix = ''
  if (signDisplay !== 'never') {
    if (rounded < 0) prefix = MINUS
    else if (signDisplay === 'always') prefix = '+'
  }

  return `${prefix}€${body}`
}

/**
 * Format a percentage — `9,5%`, `−24%`.
 *
 * Shares the decimal separator with formatCurrency on purpose: a `9.5%` sitting next to a
 * `€1.234,56` reads as two different number systems on one screen, which is the same defect
 * this file exists to remove.
 */
export function formatPercent(value: number, options: { decimals?: 0 | 1; signDisplay?: 'auto' | 'always' } = {}): string {
  const { decimals = 1, signDisplay = 'auto' } = options

  const safe = Number.isFinite(value) ? value : 0
  const factor = 10 ** decimals
  const rounded = Math.round(safe * factor) / factor

  const body = Math.abs(rounded).toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  let prefix = ''
  if (rounded < 0) prefix = MINUS
  else if (signDisplay === 'always') prefix = '+'

  return `${prefix}${body}%`
}

/**
 * Format a plain number (no currency symbol) — `12.345`, for distances and counts.
 */
export function formatNumber(value: number, decimals: 0 | 1 | 2 = 0): string {
  const safe = Number.isFinite(value) ? value : 0
  return safe.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
