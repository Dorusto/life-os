import { authFetch, ApiError } from './auth'

// Same-origin: Nginx (production) / Vite dev proxy (development) forward
// /auth, /vehicles, /log, /import, /health to vehicle-manager's own API.
const BASE = ''

export interface TokenResponse {
  access_token: string
  token_type: string
  username: string
}

export interface Vehicle {
  id: number
  name: string
  active: number
  make?: string
  model?: string
  year?: number | null
}

// More endpoints (charts, log entries, value-history, Fuelio import, etc.)
// get added here in Phase 4 as the real vehicle-detail pages are built.

export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await authFetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, { redirectOn401: false })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new ApiError(res.status, body.detail || 'Login failed')
  }

  return res.json() as Promise<TokenResponse>
}

export async function getVehicles(): Promise<Vehicle[]> {
  const res = await authFetch(`${BASE}/vehicles`)
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to load vehicles')
  }
  return res.json() as Promise<Vehicle[]>
}
