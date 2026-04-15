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
  return request<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
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
  category_id: string
  category_confirmed: boolean
  duplicate: boolean
}

export interface ImportPreview {
  source_name: string
  rows: ImportRow[]
  total_rows: number
  accounts: AccountOption[]
}

export interface ImportRowConfirm {
  date: string
  merchant: string
  amount: number
  is_expense: boolean
  category_id: string
  duplicate: boolean
  notes?: string
}

export interface ImportConfirm {
  account_id: string
  rows: ImportRowConfirm[]
}

export interface ImportResult {
  imported: number
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
  // Use streaming endpoint but accumulate response for backward compatibility
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
  
  // Stream the response and accumulate
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
    
    // Stream the response as text
    const reader = res.body?.getReader()
    if (!reader) {
      onError('No response body')
      return
    }
    
    const decoder = new TextDecoder()
    let accumulated = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      accumulated += chunk
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
