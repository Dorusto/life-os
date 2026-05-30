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
}

export interface ConfirmResponse {
  success: boolean
  duplicate: boolean
  transaction_id: string | null
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

// --- Transactions ---

export async function getTransactions(limit = 20): Promise<Transaction[]> {
  return request<Transaction[]>(`/transactions?limit=${limit}`)
}

export async function getAccounts(): Promise<Account[]> {
  return request<Account[]>('/accounts')
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
  count: number
  categories: CategoryStat[]
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
  duplicate: boolean
  is_transfer_candidate: boolean
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

// --- Budget ---

export interface BudgetCategory {
  category_id: string
  category_name: string
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
