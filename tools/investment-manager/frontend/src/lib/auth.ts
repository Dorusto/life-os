/**
 * Auth helpers — JWT token storage and retrieval.
 *
 * Copied from tools/vehicle-manager/frontend/src/lib/auth.ts — identical
 * shape, own storage keys. See that file for the localStorage-vs-cookies
 * reasoning (private network, no CSRF concern) — not repeated here.
 */

const TOKEN_KEY = 'investment_manager_token'
const USERNAME_KEY = 'investment_manager_username'

export function saveAuth(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USERNAME_KEY, username)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY)
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token) return false

  // Decode JWT payload (no verification — the server verifies on every request).
  // Just check the expiry locally so we can redirect to login proactively.
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

/**
 * Authenticated fetch wrapper that automatically adds the JWT token.
 * Returns the raw Response object for custom handling.
 */
export async function authFetch(
  input: RequestInfo,
  init?: RequestInit,
  opts?: { redirectOn401?: boolean }
): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(input, {
    ...init,
    headers,
  })
  if (res.status === 401 && opts?.redirectOn401 !== false) {
    clearAuth()
    window.location.href = '/login'
    throw new ApiError(401, 'Session expired')
  }
  return res
}
