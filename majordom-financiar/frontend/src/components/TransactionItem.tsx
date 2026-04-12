import type { Transaction } from '../lib/api'

/**
 * A single transaction row in the Home screen list.
 * Shows merchant, category, date on the left; amount on the right.
 * Expenses are white, refunds/income are green.
 */

// Category ID → emoji mapping (mirrors categories.json)
const CATEGORY_EMOJI: Record<string, string> = {
  groceries: '🛒',
  restaurants: '🍽️',
  transport: '🚗',
  utilities: '💡',
  health: '💊',
  clothing: '👕',
  home: '🏠',
  entertainment: '🎬',
  education: '📚',
  children: '👨‍👩‍👧‍👦',
  personal: '💰',
  investments: '📈',
  other: '📦',
}

interface Props {
  transaction: Transaction
}

export default function TransactionItem({ transaction: tx }: Props) {
  const emoji = tx.category_id ? (CATEGORY_EMOJI[tx.category_id] ?? '📦') : '📦'
  const formattedDate = formatDate(tx.date)
  const formattedAmount = `${tx.is_expense ? '-' : '+'}€${tx.amount.toFixed(2)}`

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface hover:bg-surface-2 transition-colors">
      {/* Category icon */}
      <div className="w-10 h-10 rounded-xl bg-background flex items-center justify-center text-lg flex-shrink-0">
        {emoji}
      </div>

      {/* Merchant + category */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{tx.merchant}</p>
        <p className="text-muted text-xs mt-0.5">
          {tx.category ?? 'Uncategorized'} · {formattedDate}
        </p>
      </div>

      {/* Amount */}
      <span
        className={`text-sm font-medium flex-shrink-0 ${
          tx.is_expense ? 'text-white' : 'text-success'
        }`}
      >
        {formattedAmount}
      </span>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

    if (isSameDay(d, today)) return 'Today'
    if (isSameDay(d, yesterday)) return 'Yesterday'

    return d.toLocaleDateString('en-NL', { day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
