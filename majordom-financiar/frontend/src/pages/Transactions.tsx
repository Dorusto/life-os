import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Filter, List, Loader2, Table2, X } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'
import BottomSheet from '../components/BottomSheet'
import {
  bulkUpdateCategory,
  getAccountList,
  getCategories,
  getTransactionsFiltered,
  type Transaction,
  type TransactionFilters,
} from '../lib/api'

const LIMIT = 50
const VIEW_STORAGE_KEY = 'majordom_transactions_view_v1'

type View = 'list' | 'table'

interface FiltersState {
  dateFrom: string
  dateTo: string
  accountId: string
  categoryId: string
  payee: string
  amountMin: string
  amountMax: string
  isExpense: '' | 'expense' | 'income'
}

const EMPTY_FILTERS: FiltersState = {
  dateFrom: '',
  dateTo: '',
  accountId: '',
  categoryId: '',
  payee: '',
  amountMin: '',
  amountMax: '',
  isExpense: '',
}

const INPUT_CLS =
  'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent disabled:opacity-50'

function loadViewPref(): View {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY)
    if (raw === 'list' || raw === 'table') return raw
  } catch {
    // localStorage unavailable — fall through to default
  }
  return 'list'
}

function saveViewPref(view: View) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view)
  } catch {
    // localStorage unavailable — view choice just won't persist
  }
}

/**
 * Transactions tab — full filterable/sortable table with bulk category edit
 * (#184). Replaces the old "coming soon" placeholder. Deliberately no-AI: a
 * plain CRUD screen (search, filter, checkbox bulk-select, one bulk action),
 * outside the chat/LLM path entirely.
 */
export default function TransactionsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState<View>(loadViewPref)
  const getInitialFilters = (): FiltersState => {
    const categoryId = location.state?.categoryId
    return categoryId ? { ...EMPTY_FILTERS, categoryId } : EMPTY_FILTERS
  }
  const [applied, setApplied] = useState<FiltersState>(getInitialFilters)
  const [draft, setDraft] = useState<FiltersState>(getInitialFilters)
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offsetRef = useRef(0)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)

  // If we arrived via a category click, clear the router state after reading it
  // so that back/forward navigation doesn't re-apply an old filter unexpectedly.
  useEffect(() => {
    if (location.state?.categoryId) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 120_000,
  })
  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: getAccountList,
    staleTime: 120_000,
  })

  const load = useCallback(
    async (append: boolean) => {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      setError(null)
      const offset = append ? offsetRef.current : 0
      const filters: TransactionFilters = {
        limit: LIMIT,
        offset,
        accountId: applied.accountId || undefined,
        categoryId: applied.categoryId || undefined,
        payee: applied.payee || undefined,
        uncategorizedOnly,
        amountMin: applied.amountMin === '' ? undefined : Number(applied.amountMin),
        amountMax: applied.amountMax === '' ? undefined : Number(applied.amountMax),
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
        isExpense: applied.isExpense === '' ? undefined : applied.isExpense === 'expense',
      }
      try {
        const rows = await getTransactionsFiltered(filters)
        setTransactions(prev => (append ? [...prev, ...rows] : rows))
        offsetRef.current = offset + rows.length
        setHasMore(rows.length >= LIMIT)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load transactions')
      } finally {
        if (append) {
          setLoadingMore(false)
        } else {
          setLoading(false)
        }
      }
    },
    [applied, uncategorizedOnly],
  )

  useEffect(() => {
    load(false)
  }, [load])

  const changeView = (v: View) => {
    setView(v)
    saveViewPref(v)
  }

  const openFilters = () => {
    setDraft(applied)
    setFiltersOpen(true)
  }

  const applyFilters = () => {
    setApplied(draft)
    setFiltersOpen(false)
  }

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setFiltersOpen(false)
  }

  const toggleRow = (id: string) => {
    setBulkNotice(null)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const allVisibleSelected = transactions.length > 0 && transactions.every(t => selected.has(t.id))

  const toggleSelectAll = () => {
    setBulkNotice(null)
    if (allVisibleSelected) {
      setSelected(new Set())
    } else {
      setSelected(prev => new Set([...prev, ...transactions.map(t => t.id)]))
    }
  }

  const applyBulk = async () => {
    if (!bulkCategoryId) return
    const selectedCount = selected.size
    const financialIds = transactions
      .filter(t => selected.has(t.id))
      .map(t => t.financial_id)
      .filter((x): x is string => Boolean(x))
    if (financialIds.length === 0) {
      setBulkError('None of the selected rows can be updated (no financial_id).')
      return
    }
    setBulkSaving(true)
    setBulkError(null)
    setBulkNotice(null)
    try {
      await bulkUpdateCategory(financialIds, bulkCategoryId)
      setSelected(new Set())
      setBulkCategoryId('')
      if (financialIds.length < selectedCount) {
        setBulkNotice(
          `Updated ${financialIds.length} of ${selectedCount} — the rest have no financial_id and can't be bulk-edited.`
        )
      }
      await load(false)
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'Bulk update failed')
    } finally {
      setBulkSaving(false)
    }
  }

  const amountText = (tx: Transaction) => `${tx.is_expense ? '−' : '+'}€${tx.amount.toFixed(2)}`

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader label="All transactions" title="Transactions" actions={<StandardHeaderActions />} bordered />

      <section className="flex-1 px-5 pb-40">
        {/* Toolbar: list/table toggle + filters */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            <button
              onClick={() => changeView('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === 'list' ? 'bg-accent text-white' : 'text-muted hover:text-white'
              }`}
            >
              <List size={14} /> List
            </button>
            <button
              onClick={() => changeView('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === 'table' ? 'bg-accent text-white' : 'text-muted hover:text-white'
              }`}
            >
              <Table2 size={14} /> Table
            </button>
          </div>
          <button
            onClick={openFilters}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-surface border border-border text-white font-semibold text-sm hover:bg-surface-2 transition-colors"
          >
            <Filter size={14} /> Filters
          </button>
        </div>

        {/* Uncategorized chip — the primary #178 use case, one tap */}
        <div className="flex items-center gap-2 flex-wrap pb-2">
          <button
            onClick={() => setUncategorizedOnly(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              uncategorizedOnly
                ? 'bg-accent border-accent text-white'
                : 'bg-surface border-border text-muted hover:text-white'
            }`}
          >
            Uncategorized
            {uncategorizedOnly && <X size={12} />}
          </button>
        </div>

        {loading && transactions.length === 0 && (
          <div className="flex items-center justify-center py-16 text-muted">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}
        {!loading && error && transactions.length === 0 && (
          <p className="text-red-400 text-sm py-8">{error}</p>
        )}
        {!loading && !error && transactions.length === 0 && (
          <p className="text-muted text-sm py-8">No transactions match the current filters.</p>
        )}

        {transactions.length > 0 && view === 'list' && (
          <>
            <div className="flex items-center justify-between py-2">
              <label className="flex items-center gap-2 text-muted text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="accent-accent"
                />
                Select all
              </label>
            </div>
            <div className="space-y-2">
              {transactions.map(tx => (
                <label
                  key={tx.id}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-surface hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={() => toggleRow(tx.id)}
                    className="accent-accent flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{tx.merchant || 'Unknown'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="inline-block bg-surface-2 text-muted text-[10px] font-bold px-1.5 py-0.5 rounded max-w-[16ch] truncate">
                        {tx.category ?? 'Uncategorized'}
                      </span>
                      <span className="text-muted text-xs flex-shrink-0">{formatDate(tx.date)}</span>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[13.5px] tabular-nums flex-shrink-0 ${!tx.is_expense ? 'text-positive' : 'text-white'}`}
                  >
                    {amountText(tx)}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {transactions.length > 0 && view === 'table' && (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm border-collapse min-w-[540px]">
              <thead>
                <tr className="text-left text-muted text-xs">
                  <th className="py-2 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="accent-accent"
                    />
                  </th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Merchant</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Account</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-t border-border">
                    <td className="py-2.5 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.has(tx.id)}
                        onChange={() => toggleRow(tx.id)}
                        className="accent-accent"
                      />
                    </td>
                    <td className="py-2.5 pr-3 text-muted whitespace-nowrap">{tx.date}</td>
                    <td className="py-2.5 pr-3 text-white whitespace-nowrap max-w-[20ch] truncate">
                      {tx.merchant || 'Unknown'}
                    </td>
                    <td className="py-2.5 pr-3 text-muted whitespace-nowrap">{tx.category ?? 'Uncategorized'}</td>
                    <td className="py-2.5 pr-3 text-muted whitespace-nowrap">{tx.account}</td>
                    <td
                      className={`py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${!tx.is_expense ? 'text-positive' : 'text-white'}`}
                    >
                      {amountText(tx)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {transactions.length > 0 && hasMore && (
          <button
            onClick={() => load(true)}
            disabled={loadingMore}
            className="mt-4 w-full py-3 rounded-xl bg-surface border border-border text-white text-sm font-semibold hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="flex flex-col gap-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-muted text-xs">
              From
              <input
                type="date"
                value={draft.dateFrom}
                onChange={e => setDraft({ ...draft, dateFrom: e.target.value })}
                className={INPUT_CLS}
              />
            </label>
            <label className="flex flex-col gap-1 text-muted text-xs">
              To
              <input
                type="date"
                value={draft.dateTo}
                onChange={e => setDraft({ ...draft, dateTo: e.target.value })}
                className={INPUT_CLS}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-muted text-xs">
            Account
            <select
              value={draft.accountId}
              onChange={e => setDraft({ ...draft, accountId: e.target.value })}
              className={INPUT_CLS}
            >
              <option value="">Any account</option>
              {accounts?.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-muted text-xs">
            Category
            <select
              value={draft.categoryId}
              onChange={e => setDraft({ ...draft, categoryId: e.target.value })}
              className={INPUT_CLS}
            >
              <option value="">Any category</option>
              {categories?.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-muted text-xs">
            Payee
            <input
              type="text"
              value={draft.payee}
              onChange={e => setDraft({ ...draft, payee: e.target.value })}
              placeholder="Search merchant…"
              className={INPUT_CLS}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-muted text-xs">
              Min amount (€)
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.amountMin}
                onChange={e => setDraft({ ...draft, amountMin: e.target.value })}
                placeholder="0.00"
                className={INPUT_CLS}
              />
            </label>
            <label className="flex flex-col gap-1 text-muted text-xs">
              Max amount (€)
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.amountMax}
                onChange={e => setDraft({ ...draft, amountMax: e.target.value })}
                placeholder="0.00"
                className={INPUT_CLS}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-muted text-xs">
            Type
            <select
              value={draft.isExpense}
              onChange={e => setDraft({ ...draft, isExpense: e.target.value as FiltersState['isExpense'] })}
              className={INPUT_CLS}
            >
              <option value="">Any</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>

          <div className="flex gap-2 pt-2">
            <button
              onClick={clearFilters}
              className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-white text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={applyFilters}
              className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </BottomSheet>

      {bulkNotice && selected.size === 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border px-4 py-3 z-40 flex items-center justify-between gap-2">
          <p className="text-amber-400 text-xs">{bulkNotice}</p>
          <button
            onClick={() => setBulkNotice(null)}
            className="text-muted hover:text-white flex-shrink-0"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border px-4 py-3 z-40">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-semibold flex-shrink-0">{selected.size} selected</p>
            <select
              value={bulkCategoryId}
              onChange={e => setBulkCategoryId(e.target.value)}
              className="flex-1 min-w-0 bg-surface-2 border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="">Set category…</option>
              {categories?.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={applyBulk}
              disabled={!bulkCategoryId || bulkSaving}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {bulkSaving && <Loader2 size={14} className="animate-spin" />}
              Apply
            </button>
          </div>
          {bulkError && <p className="text-red-400 text-xs mt-1.5">{bulkError}</p>}
        </div>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
