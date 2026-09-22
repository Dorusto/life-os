import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Upload } from 'lucide-react'
import { deleteTransaction, getSecurities, getTransactions } from '../lib/api'
import { Button } from '../components/Button'
import { Card } from '../components/kit/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/kit/Stats'
import { ErrorState, Loading } from '../components/Feedback'
import { PageHeader } from '../components/shell/PageHeader'
import { Select } from '../components/Form'
import { Pill, TypePill } from '../components/Pill'
import { SecurityModal } from '../components/SecurityModal'
import { TransactionModal } from '../components/TransactionModal'
import { XtbImportModal } from '../components/XtbImportModal'
import { formatDate, formatMoney, formatShares } from '../lib/format'
import { transactionSignedAmount } from '../lib/transactions'
import { changeTextClass, cn } from '../lib/ui'

const TYPE_FILTERS = ['all', 'buy', 'sell', 'dividend', 'fee']

export default function Transactions() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState('all')
  const [securityFilter, setSecurityFilter] = useState('all')
  const [showTransaction, setShowTransaction] = useState(false)
  const [showSecurity, setShowSecurity] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const securities = useQuery({ queryKey: ['securities'], queryFn: getSecurities })
  const transactions = useQuery({
    queryKey: ['transactions', typeFilter, securityFilter],
    queryFn: () =>
      getTransactions({
        type: typeFilter === 'all' ? undefined : typeFilter,
        security_id: securityFilter === 'all' ? undefined : Number(securityFilter),
      }),
  })

  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries()
      setPendingDelete(null)
    },
  })

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every buy, sell, dividend and fee, newest first."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" /> Import XTB
            </Button>
            <Button variant="secondary" onClick={() => setShowSecurity(true)}>
              Add security
            </Button>
            <Button variant="primary" onClick={() => setShowTransaction(true)}>
              <Plus className="h-4 w-4" /> Add transaction
            </Button>
          </>
        }
      />

      <Card
        padded={false}
        label="Ledger"
        action={
          <div className="flex items-center gap-2">
            <Select
              aria-label="Filter by security"
              className="h-8 w-auto py-0 text-[12px]"
              value={securityFilter}
              onChange={(e) => setSecurityFilter(e.target.value)}
            >
              <option value="all">All securities</option>
              {(securities.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ticker}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by type"
              className="h-8 w-auto py-0 text-[12px]"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {TYPE_FILTERS.map((t) => (
                <option key={t} value={t}>
                  {t === 'all' ? 'All types' : t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {transactions.isLoading ? (
          <Loading />
        ) : transactions.isError ? (
          <div className="p-5">
            <ErrorState onRetry={() => transactions.refetch()} />
          </div>
        ) : (transactions.data ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No transactions"
              description="Add one manually, or import an XTB report to backfill your history."
              action={
                <Button variant="primary" onClick={() => setShowTransaction(true)}>
                  Add transaction
                </Button>
              }
            />
          </div>
        ) : (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Security</th>
                  <th className="px-3 py-3 text-right font-medium">Quantity</th>
                  <th className="px-3 py-3 text-right font-medium">Price</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(transactions.data ?? []).map((t) => {
                  const amount = transactionSignedAmount(t)
                  return (
                    <tr key={t.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="whitespace-nowrap px-5 py-3 font-mono tnum text-ink-2">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-3 py-3">
                        <TypePill type={t.type} />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-mono text-[13px] font-medium text-ink">{t.ticker}</p>
                        <p className="max-w-[160px] truncate text-[12px] text-ink-3">{t.security_name ?? '—'}</p>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tnum text-ink-2">
                        {t.quantity !== null ? formatShares(t.quantity) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tnum text-ink-2">
                        {t.price_per_unit !== null ? formatMoney(t.price_per_unit, t.currency) : '—'}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tnum font-medium ${
                          amount > 0 ? 'text-gain' : amount < 0 ? 'text-loss' : 'text-ink-2'
                        }`}
                      >
                        {formatMoney(amount, t.currency)}
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={t.source === 'csv_import' ? 'brand' : 'neutral'}>
                          {t.source === 'csv_import' ? 'XTB' : 'Manual'}
                        </Pill>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          aria-label="Delete transaction"
                          onClick={() => setPendingDelete(t.id)}
                          className="rounded p-1.5 text-ink-3 transition-colors hover:bg-loss-soft hover:text-loss"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Phones: same rows as the table above, laid out as two-line list items. */}
        <ul className="divide-y divide-line md:hidden">
          {(transactions.data ?? []).map((t) => {
            const amount = transactionSignedAmount(t)
            return (
              <li key={t.id} className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[13px] font-medium text-ink">{t.ticker}</span>
                    <span className={cn('shrink-0 font-mono tnum font-medium', changeTextClass(amount))}>
                      {formatMoney(amount, t.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="truncate text-xs text-ink-2">{t.security_name ?? '—'}</p>
                    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-ink-3">
                      {formatDate(t.date)}
                      <TypePill type={t.type} />
                      <span className="font-mono tnum">
                        {t.quantity !== null ? formatShares(t.quantity) : '—'} ×{' '}
                        {t.price_per_unit !== null ? formatMoney(t.price_per_unit, t.currency) : '—'}
                      </span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Delete transaction"
                  onClick={() => setPendingDelete(t.id)}
                  className="rounded p-1.5 text-ink-3 transition-colors hover:bg-loss-soft hover:text-loss"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      <TransactionModal open={showTransaction} onClose={() => setShowTransaction(false)} securities={securities.data ?? []} />
      <SecurityModal open={showSecurity} onClose={() => setShowSecurity(false)} />
      <XtbImportModal open={showImport} onClose={() => setShowImport(false)} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete transaction"
        message="This permanently removes the transaction. Portfolio totals and returns will be recalculated."
        confirmLabel="Delete"
        danger
        pending={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete !== null && remove.mutate(pendingDelete)}
      />
    </>
  )
}
