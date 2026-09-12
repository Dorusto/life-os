import type { Transaction } from './api'

/**
 * Signed cash value of a transaction in its own currency, mirroring the
 * backend's stats._transaction_cash_native for display. Imports carry an
 * explicit ``cash_amount``; manual buy/sell rows derive it from quantity ×
 * price ± fees.
 */
export function transactionSignedAmount(t: Transaction): number {
  if (t.cash_amount !== null && t.cash_amount !== undefined) return t.cash_amount
  const qty = t.quantity ?? 0
  const price = t.price_per_unit ?? 0
  switch (t.type) {
    case 'buy':
      return -(qty * price + (t.fees ?? 0))
    case 'sell':
      return qty * price - (t.fees ?? 0)
    case 'fee':
      return -(t.fees ?? 0)
    default:
      return 0
  }
}
