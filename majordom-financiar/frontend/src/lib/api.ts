/**
 * API client — all HTTP calls to the FastAPI backend go through here.
 *
 * Why centralize API calls in one file?
 * If the backend URL changes, or you need to add a header to all requests,
 * you change it in one place instead of hunting through components.
 * Components never call fetch() directly — they call functions from this file.
 */

import { getToken, clearAuth } from './auth'

// In production, API calls go to /api/* (same origin, proxied by Nginx).
// In local dev (npm run dev), Vite proxies /api/* to localhost:8000.
const BASE = '/api'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Base fetch wrapper — attaches JWT token and handles 401 (auto logout).
 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  // Don't set Content-Type for FormData — browser sets it with the boundary
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    // Token expired or invalid — clear local auth and reload to login screen
    clearAuth()
    window.location.href = '/login'
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail || 'Request failed')
  }

  return res.json() as Promise<T>
}

// --- Types (mirror backend Pydantic models) ---

export interface TokenResponse {
  access_token: string
  token_type: string
  username: string
}

export interface Category {
  id: string
  name: string
  emoji: string
}

export interface AccountOption {
  id: string
  name: string
}

export interface ReceiptDraft {
  receipt_id: string
  image_url: string
  merchant: string | null
  amount: number | null
  date: string | null
  suggested_category_id: string | null
  category_source: 'history' | 'keywords' | 'ai' | 'none'
  categories: Category[]
  accounts: AccountOption[]
  // Fuel receipt fields
  receipt_type: 'fuel' | 'grocery'
  liters: number | null
  price_per_liter: number | null
  fuel_grade: string | null
  vehicles: VehicleOption[]
  suggested_vehicle_id: number | null
  odo_km?: number | null
}

export interface VehicleOption {
  id: number
  name: string
  last_odo: number | null
}

export interface ConfirmResponse {
  success: boolean
  duplicate: boolean
  transaction_id: string | null
}

export interface FuelConfirmRequest {
  receipt_id: string
  account_id: string
  category_name: string
  date: string
  station: string
  total_eur: number
  vehicle_id: number
  liters: number
  price_per_liter: number | null
  odo_km: number | null
  full_tank: boolean
  missed_fill: boolean
  fuel_grade: string | null
  notes: string | null
}

export interface FuelConfirmResponse {
  success: boolean
  duplicate: boolean
  transaction_id: string | null
  vehicle_log_id: number | null
  km_since_last: number | null
  consumption_l100km: number | null
  cost_per_km: number | null
  vehicle_name: string | null
  liters: number | null
  price_per_liter: number | null
  fuel_grade: string | null
}

export interface Transaction {
  id: string
  date: string
  merchant: string
  amount: number
  is_expense: boolean
  category: string | null
  category_id: string | null
  account: string
  notes: string | null
}

export interface Account {
  id: string
  name: string
  balance: number
}

export interface AccountListItem {
  id: string
  name: string
  balance: number
  off_budget: boolean
}

// --- Auth ---

export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new ApiError(res.status, body.detail || 'Login failed')
  }

  return res.json() as Promise<TokenResponse>
}

// --- Receipts ---

export async function uploadReceipt(file: File): Promise<ReceiptDraft> {
  const form = new FormData()
  form.append('file', file)
  return request<ReceiptDraft>('/receipts', { method: 'POST', body: form })
}

export async function confirmReceipt(data: {
  receipt_id: string
  merchant: string
  amount: number
  date: string
  category_id: string
  account_id: string
  notes?: string
}): Promise<ConfirmResponse> {
  return request<ConfirmResponse>(`/receipts/${data.receipt_id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function confirmFuelReceipt(data: FuelConfirmRequest): Promise<FuelConfirmResponse> {
  return request<FuelConfirmResponse>(`/receipts/${data.receipt_id}/confirm-fuel`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// --- Transactions ---

export async function getTransactions(limit = 20): Promise<Transaction[]> {
  return request<Transaction[]>(`/transactions?limit=${limit}`)
}

export async function getAccounts(): Promise<Account[]> {
  return request<Account[]>('/accounts')
}

export async function getAccountList(): Promise<AccountListItem[]> {
  return request<AccountListItem[]>('/accounts')
}

// --- FIRE ---

export interface FireData {
  fire_portfolio: number
  fire_target: number
  fire_pct: number
  months_remaining: number
  projected_2035: number
  on_track: boolean
  monthly_contribution: number
}

export async function getFire(): Promise<FireData> {
  return request<FireData>('/stats/fire')
}

// --- Stats ---

export interface CategoryStat {
  name: string
  total: number
  count: number
  percentage: number
}

export interface MonthlyStats {
  month: number
  year: number
  total: number
  income: number
  count: number
  categories: CategoryStat[]
}

// --- Fuelio Import ---

export interface FuelioImportResult {
  vehicle_name: string
  fuel_entries: number
  fuel_skipped: number
  cost_entries: number
  cost_skipped: number
}

export async function importFuelio(file: File): Promise<FuelioImportResult> {
  const form = new FormData()
  form.append('file', file)
  return request<FuelioImportResult>('/import/fuelio', { method: 'POST', body: form })
}

// --- CSV Import ---

export interface ImportRow {
  id: string
  date: string
  merchant: string
  amount: number
  is_expense: boolean
  currency: string
  category_name: string      // actual AB category name, or "" if unknown
  category_confirmed: boolean
  duplicate: boolean
  is_transfer_candidate: boolean
}

export interface ImportPreview {
  source_name: string
  rows: ImportRow[]
  total_rows: number
  accounts: AccountOption[]
  ab_categories: string[]    // all AB category names for the dropdown
}

export interface ImportRowConfirm {
  date: string
  merchant: string
  amount: number
  is_expense: boolean
  category_name: string      // actual AB category name, or "" = uncategorized
  category_confirmed?: boolean  // true = from history; false = LLM suggestion (default false)
  duplicate: boolean
  is_transfer_candidate: boolean
  transfer_to_account_id?: string  // set → create AB transfer to this account
  notes?: string
}

export interface ImportConfirm {
  account_id: string
  rows: ImportRowConfirm[]
}

export interface ImportResult {
  imported: number
  merged?: number
  skipped: number
  retroactively_updated?: number
  unknown_income_rows?: Array<{ payee: string; amount: number; date: string }>
  account_balance?: number
  account_name?: string
}

export async function previewCsvImport(file: File): Promise<ImportPreview> {
  const form = new FormData()
  form.append('file', file)
  return request<ImportPreview>('/import/csv', { method: 'POST', body: form })
}

export async function confirmCsvImport(data: ImportConfirm): Promise<ImportResult> {
  return request<ImportResult>('/import/csv/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// --- Setup ---

export interface SetupAccount {
  id: string
  name: string
  balance: number
}

export interface SetupStatus {
  completed: boolean
  accounts: SetupAccount[]
}

export interface SetupAdjustment {
  account_name: string
  adjustment: number
}

export interface SetupCompleteResponse {
  adjustments: SetupAdjustment[]
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return request<SetupStatus>('/setup/status')
}

export async function completeSetup(
  path: 'today' | 'history',
  balances: { account_id: string; real_balance: number }[] = [],
  new_accounts: { name: string; balance: number }[] = [],
): Promise<SetupCompleteResponse> {
  return request<SetupCompleteResponse>('/setup/complete', {
    method: 'POST',
    body: JSON.stringify({ path, balances, new_accounts }),
  })
}

// --- Chat History ---

export async function getChatHistory(): Promise<{ role: string; content: string; ts: number }[]> {
  return request('/chat/history')
}

export async function saveChatHistory(messages: { role: string; content: string }[]): Promise<void> {
  await request('/chat/history', {
    method: 'POST',
    body: JSON.stringify(messages),
  })
}

export async function clearChatHistory(): Promise<void> {
  await request('/chat/history', { method: 'DELETE' })
}

// --- Chat ---

export async function sendChatMessage(
  message: string,
  history: { role: string; content: string }[],
): Promise<{ reply: string }> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  headers['Content-Type'] = 'application/json'
  
  const body = JSON.stringify({ message, history })
  
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers,
    body,
  })
  
  if (res.status === 401) {
    clearAuth()
    window.location.href = '/login'
    throw new ApiError(401, 'Session expired')
  }
  
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, errorBody.detail || 'Request failed')
  }
  
  const reader = res.body?.getReader()
  if (!reader) {
    throw new ApiError(500, 'No response body')
  }
  
  const decoder = new TextDecoder()
  let accumulated = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    accumulated += decoder.decode(value, { stream: true })
  }
  
  return { reply: accumulated }
}

export async function sendChatMessageStreaming(
  message: string,
  history: { role: string; content: string }[],
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: string) => void
): Promise<void> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  headers['Content-Type'] = 'application/json'
  
  const body = JSON.stringify({ message, history })
  
  try {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers,
      body,
    })
    
    if (res.status === 401) {
      clearAuth()
      window.location.href = '/login'
      onError('Session expired')
      return
    }
    
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
      onError(errorBody.detail || 'Request failed')
      return
    }
    
    const reader = res.body?.getReader()
    if (!reader) {
      onError('No response body')
      return
    }
    
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      onChunk(chunk)
    }

    onComplete()
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error')
  }
}

export async function getMonthlyStats(month?: number, year?: number): Promise<MonthlyStats> {
  const params = new URLSearchParams()
  if (month) params.set('month', String(month))
  if (year) params.set('year', String(year))
  const qs = params.toString()
  return request<MonthlyStats>(`/stats${qs ? `?${qs}` : ''}`)
}

// --- Goals ---

export interface Goal {
  id: string
  name: string
  balance: number
  target: number
  percentage: number
  deadline?: string | null
  monthly_needed?: number | null
  months_remaining?: number | null
}

export async function getGoals(): Promise<Goal[]> {
  return request<Goal[]>('/accounts/goals')
}

// --- Home (unified endpoint) ---

export interface HomeData {
  stats: MonthlyStats
  budget: BudgetCategory[]
  goals: Goal[]
  fire: FireData
}

export async function getHomeData(month?: number, year?: number): Promise<HomeData> {
  const params = new URLSearchParams()
  if (month) params.set('month', String(month))
  if (year) params.set('year', String(year))
  const qs = params.toString()
  return request<HomeData>(`/home${qs ? `?${qs}` : ''}`)
}

// --- Budget ---

export interface BudgetCategory {
  category_id: string
  category_name: string
  group_name: string
  budgeted: number
  spent: number
  percentage: number
}

export async function getBudgetStatus(month?: number, year?: number): Promise<BudgetCategory[]> {
  const params = new URLSearchParams()
  if (month) params.set('month', String(month))
  if (year) params.set('year', String(year))
  const qs = params.toString()
  return request<BudgetCategory[]>(`/budget${qs ? `?${qs}` : ''}`)
}

// --- Categories ---

export interface CategoryItem {
  id: string
  name: string
  group_name: string
  is_income: boolean
}

export async function getCategories(): Promise<CategoryItem[]> {
  return request<CategoryItem[]>('/categories')
}

// --- Proposals ---

export interface ConfirmResult {
  success: boolean
  message: string
}

export async function confirmProposal(id: string, categoryName?: string, accountId?: string): Promise<ConfirmResult> {
  return request<ConfirmResult>(`/proposals/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ category_name: categoryName ?? null, account_id: accountId ?? null }),
  })
}

export async function cancelProposal(id: string): Promise<void> {
  return request<void>(`/proposals/${id}/cancel`, { method: 'POST' })
}

// --- Budget Rebalance ---

export interface BudgetRebalanceData {
  type: 'budget_rebalance'
  source_category: string
  destination_category: string
  amount: number
  month: string
  current_source_budget: number
  current_destination_budget: number
  new_source_budget: number
  new_destination_budget: number
  categories?: { name: string; budgeted: number }[]
}

export async function confirmBudgetRebalance(data: BudgetRebalanceData): Promise<{ message: string }> {
  return request('/budget/rebalance', {
    method: 'POST',
    body: JSON.stringify({
      source_category: data.source_category,
      destination_category: data.destination_category,
      amount: data.amount,
      month: data.month,
      new_source_budget: data.new_source_budget,
      new_destination_budget: data.new_destination_budget,
    }),
  })
}

// --- Clarification ---

export interface ClarificationData {
  type: 'clarification'
  question: string
  options: string[]
}

// --- Account Transfer ---

export interface AccountTransferData {
  type: 'account_transfer'
  from_account_id: string
  from_account_name: string
  to_account_id: string
  to_account_name: string
  amount: number
  date: string
  notes: string
  accounts?: { id: string; name: string; balance: number }[]
}

export async function confirmAccountTransfer(data: AccountTransferData): Promise<{ message: string }> {
  return request('/accounts/transfer', {
    method: 'POST',
    body: JSON.stringify({
      from_account_id: data.from_account_id,
      to_account_id: data.to_account_id,
      amount: data.amount,
      date: data.date,
      notes: data.notes,
    }),
  })
}

// --- Income Sources ---

export async function createIncomeSource(params: {
  payee: string
  type: 'income' | 'transfer'
  income_name?: string
  account_id?: string
}): Promise<{ category_name: string | null; updated_count: number }> {
  return request('/income/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payee: params.payee,
      type: params.type,
      income_name: params.income_name,
      account_id: params.account_id,
    }),
  })
}

// --- Balance Adjustment ---

export interface BalanceAdjustmentData {
  type: 'balance_adjustment'
  id: string
  account_name: string
  current_balance: number
  real_balance: number
  diff: number
}

export async function confirmBalanceAdjustment(id: string): Promise<{ message: string }> {
  return request(`/balance-adjustments/${id}/confirm`, { method: 'POST' })
}

export async function cancelBalanceAdjustment(id: string): Promise<void> {
  return request<void>(`/balance-adjustments/${id}/cancel`, { method: 'POST' })
}


// --- Category actions ---

export interface CategoryActionData {
  id: string
  action: 'rename' | 'delete' | 'create' | 'setup_groups' | 'set_budget'
  category_name: string
  new_name?: string
  group_name?: string
  available_groups?: string[]
  preview?: string
  groups?: [string, string[]][]
  // set_budget fields:
  current_amount?: number
  new_amount?: number
  month?: string
}

export async function confirmCategoryAction(
  id: string,
  override?: { target?: number; deadline?: string | null; category_name?: string; group_name?: string; amount?: number }
): Promise<{ message: string }> {
  return request(`/category-actions/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(override ?? {}),
  })
}

export async function cancelCategoryAction(id: string): Promise<void> {
  return request<void>(`/category-actions/${id}/cancel`, { method: 'POST' })
}

// --- Vehicle log actions ---

export interface VehicleLogActionData {
  id: string
  action: 'delete'
  entry_id: number
  vehicle_name: string
  date: string
  odo_km: number | null
  fuel_liters: number | null
  cost_total: number | null
  location: string | null
}

export async function confirmVehicleLogAction(id: string): Promise<{ message: string }> {
  return request(`/vehicle-log-actions/${id}/confirm`, { method: 'POST' })
}

export async function cancelVehicleLogAction(id: string): Promise<void> {
  return request<void>(`/vehicle-log-actions/${id}/cancel`, { method: 'POST' })
}

// --- Vehicle reminder actions ---

export interface VehicleReminderData {
  id: string
  vehicle_id: number
  vehicle_name: string
  vehicles: { id: number; name: string }[]
  reminder_type: 'apk' | 'insurance' | 'service'
  label: string
  due_date: string
  days_remaining: number
  interval_km?: number | null
  interval_months?: number | null
  last_service_km?: number | null
  last_service_date?: string | null
}

export async function confirmVehicleReminder(
  id: string,
  override?: { due_date?: string; vehicle_id?: number }
): Promise<{ message: string }> {
  return request(`/vehicle-reminder-actions/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(override ?? {}),
  })
}

export async function cancelVehicleReminder(id: string): Promise<void> {
  return request<void>(`/vehicle-reminder-actions/${id}/cancel`, { method: 'POST' })
}
