/**
 * Formatting helpers — shared from the start rather than copy-pasted per page
 * (plan section 11). Display currency is always EUR; native currencies use
 * their own symbol/code via Intl.
 */

// Same number system as Finance and Transport (packages/frontend-shared/formatCurrency.ts):
// Dutch grouping/decimals and a tight euro prefix — "€65.152,98" — so figures read the same
// in every app. Privacy mode (the shell's eye toggle) masks every money figure.
import { amountsHidden, MASK } from './privacy'

const LOCALE = 'nl-NL'

const EUR_BODY = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const EUR_COMPACT_BODY = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })

function eur(value: number, compact = false): string {
  const body = (compact ? EUR_COMPACT_BODY : EUR_BODY).format(Math.abs(value))
  return `${value < 0 ? '\u2212' : ''}€${body}`
}

export const EM_DASH = '—'

export function formatEur(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH
  if (amountsHidden()) return MASK
  return eur(value, compact)
}

/** Signed EUR, e.g. "+€120.00" / "−€45.50" — absolute value passed in. */
export function formatEurSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH
  if (amountsHidden()) return MASK
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : ''
  return `${sign}${eur(Math.abs(value))}`
}

export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH
  if (amountsHidden()) return MASK
  if ((currency || 'EUR') === 'EUR') return eur(value)
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

/** A return expressed as a fraction (0.1234 → "12.34%"), optionally signed. */
export function formatReturn(value: number | null | undefined, signed = true, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH
  const pct = value * 100
  const sign = signed && pct > 0 ? '+' : pct < 0 ? '\u2212' : ''
  return `${sign}${Math.abs(pct).toFixed(digits).replace(".", ",")}%`
}

/** A value already expressed in percentage points (70 → "70.0%"). */
export function formatPercentPoints(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH
  return `${value.toFixed(digits).replace(".", ",")}%`
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value)
}

/** Share quantities can carry many decimals; trim trailing zeros. */
export function formatShares(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function formatMonth(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return EM_DASH
  return value.charAt(0).toUpperCase() + value.slice(1)
}
