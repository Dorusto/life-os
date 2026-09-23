import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { CheckSquare, Filter, List, Loader2, MessageCircle, Table2, X } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'
import BottomSheet from '../components/BottomSheet'
import CategoryFilterTree from '../components/CategoryFilterTree'
import {
  bulkUpdateCategory,
  getAccountList,
  getCategories,
  getTransactionsFiltered,
  type Transaction,
  type TransactionFilters,
} from '../lib/api'
import { formatCurrency } from '../lib/formatCurrency'
import { formatDate } from '../lib/formatDate'
import { groupByMonth } from '../lib/groupByMonth'

const LIMIT = 50
const VIEW_STORAGE_KEY = 'majordom_transactions_view_v1'

type View = 'list' | 'table'

interface FiltersState {
  dateFrom: string
  dateTo: string
  accountId: string
  categoryIds: string[]
  payee: string
  amountMin: string
  amountMax: string
  isExpense: '' | 'expense' | 'income'
}

const EMPTY_FILTERS: FiltersState = {
  dateFrom: '',
  dateTo: '',
  accountId: '',
  categoryIds: [],
  payee: '',
  amountMin: '',
  amountMax: '',
  isExpense: '',
}

const INPUT_CLS =
  'w-full bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50'

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
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>(loadViewPref)
  const getInitialFilters = (): FiltersState => {
    const categoryIds = location.state?.categoryIds
    const stateDateFrom = location.state?.dateFrom
    const stateDateTo = location.state?.dateTo
    if (!categoryIds && !stateDateFrom && !stateDateTo) return EMPTY_FILTERS
    return {
      ...EMPTY_FILTERS,
      categoryIds: categoryIds || [],
      dateFrom: stateDateFrom ?? EMPTY_FILTERS.dateFrom,
      dateTo: stateDateTo ?? EMPTY_FILTERS.dateTo,
    }
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
  const [selectionMode, setSelectionMode] = useState(false)

  // If we arrived via a category click, clear the router state after reading it
  // so that back/forward navigation doesn't re-apply an old filter unexpectedly.
  useEffect(() => {
    const s = location.state
    if (s?.categoryIds || s?.dateFrom || s?.dateTo) {
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
      const offset = append ? offsetRef.current : 0
      const filters: TransactionFilters = {
        limit: LIMIT,
        offset,
        accountId: applied.accountId || undefined,
        categoryIds: applied.categoryIds.length ? applied.categoryIds : undefined,
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
        // Clear only on success so a failed load-more/filter keeps its banner
        // visible while the previously loaded rows stay on screen.
        setError(null)
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

  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelected(new Set())
    }
    setSelectionMode(!selectionMode)
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
      // Recategorized rows change per-category spend and grouping everywhere —
      // refresh the queries derived from them. Balances and duplicate pairing
      // are untouched, so account-list and duplicates stay as they are.
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['home'] })
      queryClient.invalidateQueries({ queryKey: ['uncategorized-groups'] })
      queryClient.invalidateQueries({ queryKey: ['home-pending'] })
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

  const amountText = (tx: Transaction) =>
    formatCurrency(tx.is_expense ? -Math.abs(tx.amount) : Math.abs(tx.amount), { signDisplay: 'always' })

  // Prefill text for the "Ask Majordom" action — navigates to chat with the
  // question typed in but never sent (architecture.md rule 30).
  const askMajordomPrefill = (tx: Transaction) =>
    `About this transaction: ${formatDate(tx.date)} · ${tx.merchant || 'Unknown'} · ${amountText(tx)} · ${tx.category ?? 'uncategorized'} · account ${tx.account} — what is it and what should I do with it?`

  // Grouped by month for both views — replaces a flat list with a month
  // header + net total per group (audit §5 item #14).
  const monthGroups = groupByMonth(
    transactions,
    tx => tx.date,
    tx => (tx.is_expense ? -Math.abs(tx.amount) : Math.abs(tx.amount))
  )

  return (
    <div className="h-dvh bg-token-paper flex flex-col overflow-y-auto">
      <PageHeader label="All transactions" title="Transactions" actions={<StandardHeaderActions />} bordered />

      <section className="flex-1 px-5 pb-40">
        {/* Toolbar: list/table toggle + filters */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-1 bg-token-surface border border-token-line rounded-lg p-1">
            <button
              onClick={() => changeView('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === 'list' ? 'bg-token-brand text-token-on-brand' : 'text-token-ink-3 hover:text-token-ink'
              }`}
            >
              <List size={14} /> List
            </button>
            <button
              onClick={() => changeView('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === 'table' ? 'bg-token-brand text-token-on-brand' : 'text-token-ink-3 hover:text-token-ink'
              }`}
            >
              <Table2 size={14} /> Table
            </button>
            <button
              onClick={toggleSelectionMode}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                selectionMode ? 'bg-token-brand text-token-on-brand' : 'text-token-ink-3 hover:text-token-ink'
              }`}
            >
              <CheckSquare size={14} /> Select
            </button>
          </div>
          <button
            onClick={openFilters}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-token-surface border border-token-line text-token-ink font-semibold text-sm hover:bg-token-surface-2 transition-colors"
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
                ? 'bg-token-brand border-token-brand text-token-on-brand'
                : 'bg-token-surface border-token-line text-token-ink-3 hover:text-token-ink'
            }`}
          >
            Uncategorized
            {uncategorizedOnly && <X size={12} />}
          </button>
        </div>

        {!loading && error && transactions.length > 0 && (
          <div className="flex items-center justify-between gap-2 bg-token-loss-soft rounded-xl px-3 py-2 mb-2">
            <p className="text-token-loss text-xs">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-token-ink-3 hover:text-token-ink flex-shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {loading && transactions.length === 0 && (
          <div className="flex items-center justify-center py-16 text-token-ink-3">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}
        {!loading && error && transactions.length === 0 && (
          <p className="text-token-loss text-sm py-8">{error}</p>
        )}
        {!loading && !error && transactions.length === 0 && (
          <p className="text-token-ink-3 text-sm py-8">No transactions match the current filters.</p>
        )}

        {transactions.length > 0 && view === 'list' && (
          <>
            {selectionMode && (
            <div className="flex items-center justify-between py-2">
              <label className="flex items-center gap-2 text-token-ink-3 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-token-brand"
                />
                Select all
              </label>
            </div>
            )}
            <div className="space-y-4">
              {monthGroups.map(group => (
                <div key={group.label}>
                  <div className="flex items-center justify-between px-1 pb-1.5">
                    <span className="text-token-ink-3 text-xs font-semibold uppercase tracking-wide">{group.label}</span>
                    <span
                      className={`font-plex-mono text-xs tabular-nums ${group.total >= 0 ? 'text-token-gain' : 'text-token-ink-3'}`}
                    >
                      {formatCurrency(group.total, { decimals: 0, signDisplay: 'always' })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((tx, i) => {
                      const prevCategory = i > 0 ? group.items[i - 1].category ?? 'Uncategorized' : null
                      const hideChip = (tx.category ?? 'Uncategorized') === prevCategory
                      return (
                        <label
                          key={tx.id}
                          className={`flex items-center px-3.5 py-3 rounded-xl bg-token-surface hover:bg-token-surface-2 transition-colors cursor-pointer ${selectionMode ? 'gap-3' : ''}`}
                        >
                          {selectionMode && (
                            <input
                              type="checkbox"
                              checked={selected.has(tx.id)}
                              onChange={() => toggleRow(tx.id)}
                              className="w-4 h-4 accent-token-brand flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-token-ink text-sm font-medium truncate">{tx.merchant || 'Unknown'}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {!hideChip && (
                              <span className="inline-block bg-token-surface-2 text-token-ink-3 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                {tx.category ?? 'Uncategorized'}
                              </span>
                              )}
                              <span className="text-token-ink-3 text-xs flex-shrink-0">{formatDate(tx.date)}</span>
                            </div>
                          </div>
                          <span
                            className={`font-plex-mono text-[13.5px] tabular-nums flex-shrink-0 ${!tx.is_expense ? 'text-token-gain' : 'text-token-ink'}`}
                          >
                            {amountText(tx)}
                          </span>
                          {!selectionMode && (
                            <button
                              type="button"
                              onClick={e => {
                                // The row is a <label> — without preventDefault a click
                                // inside it is forwarded to the label's control.
                                e.preventDefault()
                                e.stopPropagation()
                                navigate('/chat', { state: { prefill: askMajordomPrefill(tx) } })
                              }}
                              aria-label="Ask Majordom about this transaction"
                              title="Ask Majordom"
                              className="ml-2 p-1.5 rounded-lg text-token-ink-3 hover:text-token-brand hover:bg-token-surface-2 flex-shrink-0"
                            >
                              <MessageCircle size={16} />
                            </button>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {transactions.length > 0 && view === 'table' && (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm border-collapse min-w-[540px]">
              <thead>
                <tr className="text-left text-token-ink-3 text-xs">
                  <th className="py-2 pr-2 w-8">
                    <label className="flex items-center justify-center w-full h-full cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 accent-token-brand"
                      />
                    </label>
                  </th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Merchant</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Account</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {monthGroups.map(group => (
                  <Fragment key={group.label}>
                    <tr className="border-t border-token-line">
                      <td colSpan={6} className="py-2 px-1">
                        <div className="flex items-center justify-between">
                          <span className="text-token-ink-3 text-xs font-semibold uppercase tracking-wide">{group.label}</span>
                          <span
                            className={`font-plex-mono text-xs tabular-nums ${group.total >= 0 ? 'text-token-gain' : 'text-token-ink-3'}`}
                          >
                            {formatCurrency(group.total, { decimals: 0, signDisplay: 'always' })}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.items.map(tx => (
                      <tr key={tx.id} className="border-t border-token-line">
                        <td className="py-2.5 pr-2">
                          <label className="flex items-center justify-center w-full h-full cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selected.has(tx.id)}
                              onChange={() => toggleRow(tx.id)}
                              className="w-4 h-4 accent-token-brand"
                            />
                          </label>
                        </td>
                        <td className="py-2.5 pr-3 text-token-ink-3 whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="py-2.5 pr-3 text-token-ink whitespace-nowrap max-w-[20ch] truncate">
                          {tx.merchant || 'Unknown'}
                        </td>
                        <td className="py-2.5 pr-3 text-token-ink-3 whitespace-nowrap">{tx.category ?? 'Uncategorized'}</td>
                        <td className="py-2.5 pr-3 text-token-ink-3 whitespace-nowrap">{tx.account}</td>
                        <td
                          className={`py-2.5 text-right font-plex-mono tabular-nums whitespace-nowrap ${!tx.is_expense ? 'text-token-gain' : 'text-token-ink'}`}
                        >
                          {amountText(tx)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {transactions.length > 0 && hasMore && (
          <button
            onClick={() => load(true)}
            disabled={loadingMore}
            className="mt-4 w-full py-3 rounded-xl bg-token-surface border border-token-line text-token-ink text-sm font-semibold hover:bg-token-surface-2 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="flex flex-col gap-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-token-ink-3 text-xs">
              From
              <input
                type="date"
                value={draft.dateFrom}
                onChange={e => setDraft({ ...draft, dateFrom: e.target.value })}
                className={INPUT_CLS}
              />
            </label>
            <label className="flex flex-col gap-1 text-token-ink-3 text-xs">
              To
              <input
                type="date"
                value={draft.dateTo}
                onChange={e => setDraft({ ...draft, dateTo: e.target.value })}
                className={INPUT_CLS}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-token-ink-3 text-xs">
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

          <CategoryFilterTree
            categories={categories ?? []}
            selected={draft.categoryIds}
            onChange={ids => setDraft({ ...draft, categoryIds: ids })}
          />

          <label className="flex flex-col gap-1 text-token-ink-3 text-xs">
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
            <label className="flex flex-col gap-1 text-token-ink-3 text-xs">
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
            <label className="flex flex-col gap-1 text-token-ink-3 text-xs">
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

          <label className="flex flex-col gap-1 text-token-ink-3 text-xs">
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
              className="flex-1 py-2.5 rounded-xl bg-token-surface-2 border border-token-line text-token-ink text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={applyFilters}
              className="flex-1 py-2.5 rounded-xl bg-token-brand hover:bg-token-brand-2 text-token-on-brand text-sm font-semibold transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </BottomSheet>

      {bulkNotice && selected.size === 0 && (
        <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 bg-token-surface border-t border-token-line px-4 py-3 z-40 flex items-center justify-between gap-2">
          <p className="text-amber-400 text-xs">{bulkNotice}</p>
          <button
            onClick={() => setBulkNotice(null)}
            className="text-token-ink-3 hover:text-token-ink flex-shrink-0"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 bg-token-surface border-t border-token-line px-4 py-3 z-40">
          <div className="flex items-center gap-2">
            <p className="text-token-ink text-sm font-semibold flex-shrink-0">{selected.size} selected</p>
            <select
              value={bulkCategoryId}
              onChange={e => setBulkCategoryId(e.target.value)}
              className="flex-1 min-w-0 bg-token-surface-2 border border-token-line rounded-lg px-3 py-2 text-token-ink text-sm focus:outline-none focus:border-token-brand disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-token-brand hover:bg-token-brand-2 text-token-on-brand text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {bulkSaving && <Loader2 size={14} className="animate-spin" />}
              Apply
            </button>
          </div>
          {bulkError && <p className="text-token-loss text-xs mt-1.5">{bulkError}</p>}
        </div>
      )}
    </div>
  )
}

