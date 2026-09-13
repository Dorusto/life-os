/**
 * Read-only transaction list card (#219/F26) — backend tool
 * (finance__list_transactions) returns {"type": "transaction_list", "title":
 * ..., "data": {"transactions": [...], "count": ...}}. Renders every entry
 * the same way every time; the model never re-formats this, unlike the old
 * plain-text finance__get_transactions replies it replaces for display.
 */
import { formatCurrency } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'

interface TransactionListItem {
  id: string
  date: string
  merchant: string
  amount: number
  is_expense: boolean
  category_name: string
  account_name: string
}

export interface TransactionListData {
  transactions: TransactionListItem[]
  count: number
}

export interface TransactionListCardProps {
  title: string
  data: TransactionListData
}

export default function TransactionListCard({ title, data }: TransactionListCardProps) {
  return (
    <div className="bg-token-surface rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs text-token-ink-3 uppercase tracking-wide">{title}</p>
        <p className="text-token-ink-3 text-xs">{data.count} transaction{data.count === 1 ? '' : 's'}</p>
      </div>

      {data.transactions.length === 0 ? (
        <p className="text-token-ink-3 text-sm text-center py-4">No transactions found.</p>
      ) : (
        <div className="space-y-2">
          {data.transactions.map(tx => (
            <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-token-paper">
              <div className="flex-1 min-w-0">
                <p className="text-token-ink text-sm font-medium truncate">{tx.merchant || 'Unknown'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-block bg-token-surface-2 text-token-ink-3 text-[10px] font-bold px-1.5 py-0.5 rounded truncate max-w-[16ch]">
                    {tx.category_name || 'Uncategorized'}
                  </span>
                  <span className="text-token-ink-3 text-xs flex-shrink-0">{formatDate(tx.date)}</span>
                  {tx.account_name && (
                    <span className="text-token-ink-2 text-xs flex-shrink-0 truncate">· {tx.account_name}</span>
                  )}
                </div>
              </div>
              <span
                className={`font-plex-mono text-[13.5px] tabular-nums flex-shrink-0 ${!tx.is_expense ? 'text-token-gain' : 'text-token-ink'}`}
              >
                {formatCurrency(tx.is_expense ? -tx.amount : tx.amount, { signDisplay: 'always' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

