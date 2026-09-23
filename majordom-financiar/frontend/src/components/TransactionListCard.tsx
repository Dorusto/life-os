/**
 * Read-only transaction list card (#219/F26) — backend tool
 * (finance__list_transactions) returns {"type": "transaction_list", "title":
 * ..., "data": {"transactions": [...], "count": ...}}. Renders every entry
 * the same way every time; the model never re-formats this, unlike the old
 * plain-text finance__get_transactions replies it replaces for display.
 */
import { formatCurrency } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'
import { ListRow, toneOf } from './kit/Stats'

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
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-token-ink-3">{title}</p>
        <p className="font-mono text-xs text-token-ink-3">{data.count} transaction{data.count === 1 ? '' : 's'}</p>
      </div>

      {data.transactions.length === 0 ? (
        <p className="text-token-ink-3 text-sm text-center py-4">No transactions found.</p>
      ) : (
        <div className="divide-y divide-token-line">
          {data.transactions.map(tx => {
            const signed = tx.is_expense ? -Math.abs(tx.amount) : Math.abs(tx.amount)
            return (
              <ListRow
                key={tx.id}
                title={tx.merchant || 'Unknown'}
                subtitle={`${tx.category_name || 'Uncategorized'}${tx.account_name ? ` · ${tx.account_name}` : ''}`}
                value={formatCurrency(signed, { signDisplay: 'always' })}
                tone={toneOf(signed)}
                meta={formatDate(tx.date)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

