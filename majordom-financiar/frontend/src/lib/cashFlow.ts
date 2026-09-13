/**
 * Income / expenses / saved aggregation over the spending-trend payload.
 *
 * Shared by the Analytics page's Trends and Cash Flow sections (issue 15): both
 * re-slice the same two-series response, so the income-vs-expense detection and
 * the saved = income − expenses arithmetic live here once instead of twice. The
 * Dashboard's own Cash Flow widget reuses it too.
 *
 * Nothing here invents a split the backend didn't make: if the response isn't a
 * per-month bar chart, or its income and expense series aren't both present and
 * distinguishable, these helpers return null and the caller reports that
 * instead of guessing (see the circuit breakers in Analytics.tsx).
 */

export interface TrendSeries {
  label: string
  color: string
}

export interface TrendPoint {
  x: string
  values: number[]
  month?: number
  year?: number
}

export interface TrendBarData {
  series: TrendSeries[]
  points: TrendPoint[]
}

export interface CashFlowPoint {
  /** The trend's own x label for the month, e.g. "Aug". */
  x: string
  /** Present only when the endpoint labels the point with its month — the
   *  Cash Flow section needs both to pin the breakdown to the same period. */
  month?: number
  year?: number
  income: number
  expenses: number
  /** income − expenses. Negative months are months that outspent their income. */
  saved: number
}

export interface CashFlow {
  /** The endpoint's own series, already resolved — a caller reuses their labels
   *  and colors rather than re-guessing which series is which. */
  incomeSeries: TrendSeries
  expenseSeries: TrendSeries
  points: CashFlowPoint[]
}

/**
 * Narrow the (untyped) chart payload before slicing it — if the trend response
 * isn't a per-month bar chart, a caller can say so rather than rendering a chart
 * built from a split that isn't there.
 */
export function asTrendBarData(data: unknown): TrendBarData | null {
  if (!data || typeof data !== 'object') return null
  const candidate = data as { series?: unknown; points?: unknown }
  if (!Array.isArray(candidate.series) || !Array.isArray(candidate.points)) return null
  return {
    series: candidate.series as TrendSeries[],
    points: candidate.points as TrendPoint[],
  }
}

/** Find a series by its own label rather than by position — the endpoint decides
 *  the order, and guessing it could silently swap Income for Expenses. */
function findSeriesIndex(series: TrendSeries[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const index = series.findIndex((s) => pattern.test(s.label))
    if (index >= 0) return index
  }
  return -1
}

function valueAt(point: TrendPoint, index: number): number {
  return point.values[index] ?? 0
}

const INCOME_PATTERNS = [/income/i, /inflow/i]
const EXPENSE_PATTERNS = [/spen/i, /expense/i]

/**
 * Income / expenses / saved per month, read from the two series the endpoint
 * already returns. Returns null when the payload isn't a per-month bar chart or
 * doesn't carry separable income and expense series — callers must handle that
 * rather than fall back to a split that isn't in the data.
 */
export function extractCashFlow(data: unknown): CashFlow | null {
  const trend = asTrendBarData(data)
  if (!trend) return null

  const incomeIndex = findSeriesIndex(trend.series, INCOME_PATTERNS)
  const expenseIndex = findSeriesIndex(trend.series, EXPENSE_PATTERNS)
  const incomeSeries = trend.series[incomeIndex]
  const expenseSeries = trend.series[expenseIndex]
  if (!incomeSeries || !expenseSeries || incomeIndex === expenseIndex) return null

  return {
    incomeSeries,
    expenseSeries,
    points: trend.points.map((point) => {
      const income = valueAt(point, incomeIndex)
      const expenses = valueAt(point, expenseIndex)
      return {
        x: point.x,
        ...(point.month != null && point.year != null
          ? { month: point.month, year: point.year }
          : {}),
        income,
        expenses,
        saved: income - expenses,
      }
    }),
  }
}
