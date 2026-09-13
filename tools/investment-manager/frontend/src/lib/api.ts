import { authFetch, ApiError } from './auth'

export { ApiError }

// Same-origin: Nginx (production) or the Vite dev proxy forwards /api/*
// (prefix stripped) to investment-manager's own API. Not a bare '' base —
// this app has SPA routes (/holdings, /income, ...) that would collide with
// bare backend paths. See frontend/nginx.conf.
const BASE = '/api'

// ---------------------------------------------------------------------------
// Types — kept in lockstep with tools/investment-manager/app/models.py
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string
  token_type: string
  username: string
}

export type AssetType = 'stock' | 'etf' | 'crypto' | 'bond' | 'fund' | 'other'
export type TransactionType = 'buy' | 'sell' | 'dividend' | 'fee'

export interface Security {
  id: number
  ticker: string
  name: string | null
  asset_type: string | null
  currency: string
}

export interface Transaction {
  id: number
  security_id: number
  ticker: string | null
  security_name: string | null
  date: string
  type: string
  quantity: number | null
  price_per_unit: number | null
  fees: number
  currency: string
  notes: string | null
  source: string
  external_id: string | null
  cash_amount: number | null
}

export interface XtbImportResult {
  securities_created: number
  transactions_inserted: number
  transactions_skipped: number
  transfers_skipped: number
  rows_unparsed: number
  warnings: string[]
}

export interface TopMover {
  ticker: string
  name: string | null
  change_pct: number
  change_eur: number
}

export interface PortfolioSummary {
  total_value_eur: number
  total_cost_eur: number
  total_unrealized_gain_eur: number
  total_unrealized_gain_pct: number | null
  period: string
  period_start: string | null
  period_end: string
  period_change_eur: number | null
  period_change_pct: number | null
  xirr: number | null
  twr: number | null
  benchmark_ticker: string | null
  benchmark_return: number | null
  top_movers: TopMover[]
  has_holdings: boolean
}

export interface AllocationSlice {
  key: string
  label: string
  value_eur: number
  percentage: number
}

export interface Allocation {
  total_value_eur: number
  by_security: AllocationSlice[]
  by_asset_type: AllocationSlice[]
  by_currency: AllocationSlice[]
}

export interface PortfolioHistory {
  dates: string[]
  values: number[]
  flows: Record<string, number>
}

export interface PortfolioValue {
  total_value_eur: number
  as_of: string
  currency: string
  positions: number
}

export interface Holding {
  security_id: number
  ticker: string
  name: string | null
  asset_type: string
  currency: string
  shares: number
  avg_cost_native: number | null
  cost_basis_native: number
  cost_basis_eur: number
  price_native: number | null
  market_value_native: number | null
  market_value_eur: number | null
  unrealized_gain_eur: number | null
  unrealized_gain_pct: number | null
  realized_gain_native: number
  dividends_native: number
  weight_pct: number | null
}

export interface IncomeEvent {
  id: number
  date: string
  ticker: string
  name: string | null
  amount_native: number
  currency: string
  amount_eur: number
  notes: string | null
}

export interface Income {
  total_eur: number
  events: IncomeEvent[]
  by_year: { year: string; amount_eur: number }[]
  by_security: { ticker: string; amount_eur: number }[]
}

export interface TargetAllocationItem {
  target_key: string
  target_percentage: number
}

export interface RebalancingRow {
  key: string
  target_percentage: number
  current_percentage: number
  current_value_eur: number
  target_value_eur: number
  suggested_eur: number
}

export interface Rebalancing {
  total_value_eur: number
  targets_sum: number
  rows: RebalancingRow[]
}

export interface Goal {
  id: number
  name: string
  target_amount: number
  target_date: string
}

export interface GoalProjectionPoint {
  date: string
  value: number
}

export interface GoalProjection {
  goal: Goal
  current_value_eur: number
  rate: number
  rate_source: 'historical_xirr' | 'assumed_return'
  assumed_return: number
  years_to_target: number
  projected_value_eur: number
  on_track: boolean
  gap_eur: number
  points: GoalProjectionPoint[]
}

export interface Settings {
  benchmark_ticker: string
  assumed_annual_return: string
  market_data_configured: boolean
}

export interface CreateSecurityInput {
  ticker: string
  name?: string | null
  asset_type?: AssetType
  currency?: string | null
}

export interface CreateTransactionInput {
  security_id: number
  date: string
  type: TransactionType
  quantity?: number | null
  price_per_unit?: number | null
  fees?: number
  currency?: string | null
  notes?: string | null
  cash_amount?: number | null
}

// ---------------------------------------------------------------------------
// Transport helpers
// ---------------------------------------------------------------------------

async function parseError(res: Response, fallback: string): Promise<ApiError> {
  const body = await res.json().catch(() => ({ detail: fallback }))
  const detail = typeof body?.detail === 'string' ? body.detail : fallback
  return new ApiError(res.status, detail)
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(`${BASE}${path}`)
  if (!res.ok) throw await parseError(res, `Request failed: ${path}`)
  return res.json() as Promise<T>
}

async function sendJson<T>(path: string, method: string, body: unknown): Promise<T> {
  const res = await authFetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res, `Request failed: ${path}`)
  return res.json() as Promise<T>
}

async function sendVoid(path: string, method: string): Promise<void> {
  const res = await authFetch(`${BASE}${path}`, { method })
  if (!res.ok) throw await parseError(res, `Request failed: ${path}`)
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await authFetch(
    `${BASE}/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
    { redirectOn401: false },
  )
  if (!res.ok) throw await parseError(res, 'Login failed')
  return res.json() as Promise<TokenResponse>
}

// ---------------------------------------------------------------------------
// Securities
// ---------------------------------------------------------------------------

export function getSecurities(): Promise<Security[]> {
  return getJson<Security[]>('/securities')
}

export function createSecurity(input: CreateSecurityInput): Promise<Security> {
  return sendJson<Security>('/securities', 'POST', input)
}

export function deleteSecurity(id: number): Promise<void> {
  return sendVoid(`/securities/${id}`, 'DELETE')
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface TransactionFilters {
  security_id?: number
  type?: string
  start_date?: string
  end_date?: string
  limit?: number
}

export function getTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  })
  const qs = params.toString()
  return getJson<Transaction[]>(`/transactions${qs ? `?${qs}` : ''}`)
}

export function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  return sendJson<Transaction>('/transactions', 'POST', input)
}

export function deleteTransaction(id: number): Promise<void> {
  return sendVoid(`/transactions/${id}`, 'DELETE')
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export async function importXtb(file: File): Promise<XtbImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await authFetch(`${BASE}/import/xtb`, { method: 'POST', body: formData })
  if (!res.ok) throw await parseError(res, 'Import failed')
  return res.json() as Promise<XtbImportResult>
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export function getPortfolioSummary(period = '1y'): Promise<PortfolioSummary> {
  return getJson<PortfolioSummary>(`/portfolio/summary?period=${encodeURIComponent(period)}`)
}

export function getPortfolioAllocation(): Promise<Allocation> {
  return getJson<Allocation>('/portfolio/allocation')
}

export function getHoldings(includeClosed = false): Promise<Holding[]> {
  return getJson<Holding[]>(`/holdings${includeClosed ? '?include_closed=true' : ''}`)
}

export function getPortfolioHistory(period = '1y'): Promise<PortfolioHistory> {
  return getJson<PortfolioHistory>(`/portfolio/history?period=${encodeURIComponent(period)}`)
}

export function getPortfolioValue(): Promise<PortfolioValue> {
  return getJson<PortfolioValue>('/portfolio/value')
}

export function getIncome(): Promise<Income> {
  return getJson<Income>('/income')
}

// ---------------------------------------------------------------------------
// Rebalancing
// ---------------------------------------------------------------------------

export function getTargetAllocation(): Promise<TargetAllocationItem[]> {
  return getJson<TargetAllocationItem[]>('/target-allocation')
}

export function setTargetAllocation(targets: TargetAllocationItem[]): Promise<TargetAllocationItem[]> {
  return sendJson<TargetAllocationItem[]>('/target-allocation', 'POST', { targets })
}

export function getRebalancing(): Promise<Rebalancing> {
  return getJson<Rebalancing>('/rebalancing')
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export function getGoals(): Promise<Goal[]> {
  return getJson<Goal[]>('/goals')
}

export function createGoal(input: { name: string; target_amount: number; target_date: string }): Promise<Goal> {
  return sendJson<Goal>('/goals', 'POST', input)
}

export function deleteGoal(id: number): Promise<void> {
  return sendVoid(`/goals/${id}`, 'DELETE')
}

export function getGoalProjection(id: number): Promise<GoalProjection> {
  return getJson<GoalProjection>(`/goals/${id}/projection`)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSettings(): Promise<Settings> {
  return getJson<Settings>('/settings')
}

export function updateSettings(input: {
  benchmark_ticker?: string
  assumed_annual_return?: number
  /** Write-only: a stored key is never returned by GET/PUT /settings. */
  twelve_data_api_key?: string
}): Promise<Settings> {
  return sendJson<Settings>('/settings', 'PUT', input)
}
