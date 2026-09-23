/**
 * "Spending" — the month's spending story in one full-width card: what went out,
 * how that compares with the month before, a bar per calendar day, income vs.
 * saving, and where the money went by category.
 *
 * Every figure comes from transactions that already exist in Actual Budget —
 * this widget adds no endpoint and stores nothing.
 */
import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAccountList, getTransactionsFiltered, type Transaction } from '../lib/api'

// /transactions caps a page at 200 rows, so a busy month is read page by page.
const PAGE_SIZE = 200
const MAX_PAGES = 10

async function fetchMonth(dateFrom: string, dateTo: string): Promise<Transaction[]> {
  const rows: Transaction[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await getTransactionsFiltered({ dateFrom, dateTo, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}
import { formatCurrency, formatPercent } from '../lib/formatCurrency'
import WidgetLoading from './WidgetLoading'
import { Card, SectionLabel } from './kit/Card'
import { BarChart, SERIES_COLORS, StackedBar, type Slice } from './kit/Charts'
import { EmptyState, HeroValue, StatStrip, toneClass, toneOf, type Stat } from './kit/Stats'

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** How many day slots the bar chart needs, and the exact YYYY-MM-DD bounds of the month. */
function monthBounds(month: number, year: number) {
  const mm = String(month).padStart(2, '0')
  const days = new Date(year, month, 0).getDate()
  return {
    days,
    dateFrom: `${year}-${mm}-01`,
    dateTo: `${year}-${mm}-${String(days).padStart(2, '0')}`,
  }
}

interface SpendingSummary {
  /** Positive magnitude of the month's spending. */
  spent: number
  /** Positive magnitude of the month's income. */
  income: number
  /** income − spent: negative means the month outspent what came in. */
  saving: number
  /** One entry per calendar day, day 1 first; days with nothing spent are 0. */
  perDay: { label: string; value: number }[]
  /** Largest categories first — top six, then everything else as "Other". */
  categories: Slice[]
}

/**
 * A move between two of the user's own accounts is neither spending nor income.
 *
 * Actual Budget gives the client no transfer flag (the Transaction contract has
 * no transfer_id), so the pair has to be recognized by shape: no category, and a
 * payee that is one of the user's own account names — the same "account_name"
 * heuristic the backend's own-account detection uses. The outgoing leg is stored
 * as an expense, so this is checked before the expense branch; otherwise a move
 * to savings would read as spending.
 */
function isOwnAccountTransfer(tx: Transaction, accountNames: Set<string>): boolean {
  if (tx.category) return false
  const payee = tx.merchant.trim().toLowerCase()
  return payee.length > 0 && accountNames.has(payee)
}

function summarize(transactions: Transaction[], days: number, accountNames: Set<string>): SpendingSummary {
  const perDay = Array.from({ length: days }, () => 0)
  const byCategory = new Map<string, number>()
  let spent = 0
  let income = 0

  for (const tx of transactions) {
    if (isOwnAccountTransfer(tx, accountNames)) continue
    // Spending is what Actual Budget flagged as an expense; an untagged inflow
    // is the far leg of a transfer, and an uncategorized outflow that isn't
    // flagged as an expense is neither spending nor income.
    if (!tx.is_expense) {
      if (!tx.category || tx.amount <= 0) continue
      income += Math.abs(tx.amount)
      continue
    }

    const out = Math.abs(tx.amount)
    spent += out
    const day = Number(tx.date.slice(8, 10)) - 1
    if (day >= 0 && day < days) perDay[day] += out
    const name = tx.category ?? 'Uncategorized'
    byCategory.set(name, (byCategory.get(name) ?? 0) + out)
  }

  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  const head = ranked.slice(0, 6)
  const tail = ranked.slice(6)

  return {
    spent,
    income,
    saving: income - spent,
    perDay: perDay.map((value, i) => ({ label: String(i + 1), value })),
    categories: [
      ...head.map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] })),
      ...(tail.length > 0
        ? [{ label: 'Other', value: tail.reduce((sum, [, value]) => sum + value, 0), color: 'var(--line-strong)' }]
        : []),
    ],
  }
}

export default function SpendingWidget({ month, year }: { month: number; year: number }) {
  const current = monthBounds(month, year)
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const previous = monthBounds(prevMonth, prevYear)

  const currentQuery = useQuery({
    queryKey: ['transactions', 'spending', year, month],
    queryFn: () =>
      fetchMonth(current.dateFrom, current.dateTo),
    staleTime: 60_000,
  })
  const previousQuery = useQuery({
    queryKey: ['transactions', 'spending', prevYear, prevMonth],
    queryFn: () =>
      fetchMonth(previous.dateFrom, previous.dateTo),
    staleTime: 60_000,
  })
  // Same key as the dashboard's own account query — this reads its cache for the
  // transfer-payee match rather than issuing a second request.
  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
  })
  const accountNames = useMemo(
    () => new Set((accounts ?? []).map(a => a.name.trim().toLowerCase())),
    [accounts],
  )

  if (currentQuery.isLoading) {
    return (
      <Card label="Spending">
        <WidgetLoading label="Loading this month's spending…" />
      </Card>
    )
  }

  if (currentQuery.isError || !currentQuery.data) {
    return (
      <Card label="Spending">
        <EmptyState
          title="Couldn't load this month's spending."
          description="The transactions for this month didn't come back from Actual Budget."
        />
      </Card>
    )
  }

  const summary = summarize(currentQuery.data, current.days, accountNames)
  const previousSummary = previousQuery.data
    ? summarize(previousQuery.data, previous.days, accountNames)
    : null

  if (summary.spent === 0 && summary.income === 0) {
    return (
      <Card label="Spending">
        <EmptyState title={`Nothing recorded in ${MONTH_NAMES_FULL[month - 1]} yet.`} />
      </Card>
    )
  }

  // The month-over-month line. Spending less than last month is the good
  // direction, so the tone is the opposite of the change itself; the percent is
  // dropped when the previous month had no spending to compare against.
  let changeLine: ReactNode
  if (previousSummary && previousSummary.spent !== summary.spent) {
    const delta = summary.spent - previousSummary.spent
    const percent =
      previousSummary.spent > 0
        ? ` (${formatPercent(Math.abs(delta / previousSummary.spent) * 100, { decimals: 0 })})`
        : ''
    changeLine = (
      <span className={toneClass(toneOf(-delta))}>
        {delta < 0 ? 'Down' : 'Up'} {formatCurrency(Math.abs(delta))}
        {percent} from last month
      </span>
    )
  } else if (previousSummary) {
    changeLine = <span className={toneClass('muted')}>Same as last month</span>
  }

  const stats: Stat[] = [
    { label: 'Income', value: formatCurrency(summary.income) },
    { label: 'Spending', value: formatCurrency(summary.spent) },
    {
      label: 'Saving',
      value: formatCurrency(summary.saving, { signDisplay: 'always' }),
      tone: toneOf(summary.saving),
    },
    {
      label: 'Savings rate',
      value:
        summary.income > 0
          ? formatPercent((summary.saving / summary.income) * 100, { decimals: 0 })
          : '—',
      tone: summary.income > 0 ? toneOf(summary.saving) : 'muted',
    },
  ]

  return (
    <Card label="Spending">
      <HeroValue
        label={`Spent · ${MONTH_NAMES_FULL[month - 1]}`}
        value={formatCurrency(summary.spent)}
        sub={changeLine}
      />
      <div className="mt-4">
        <BarChart
          data={summary.perDay}
          height={150}
          formatValue={value => formatCurrency(value, { decimals: 0 })}
          emptyMessage="Nothing spent this month."
        />
      </div>
      <StatStrip stats={stats} className="mt-5" />
      <div className="mt-5">
        <SectionLabel>Where it went</SectionLabel>
        <div className="mt-3">
          <StackedBar slices={summary.categories} formatValue={formatCurrency} />
        </div>
      </div>
    </Card>
  )
}
