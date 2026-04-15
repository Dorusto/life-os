/**
 * Auth helpers — JWT token storage and retrieval.
 *
 * Why localStorage (not cookies)?
 * - Cookies require SameSite/Secure config that's awkward on a private Tailscale network.
 * - This app is on a private network, not the public internet — CSRF is not a concern.
 * - localStorage is simpler and works identically on all mobile browsers.
 */

const TOKEN_KEY = 'majordom_token'
const USERNAME_KEY = 'majordom_username'

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

export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token) return false

  // Decode JWT payload (no verification — the server verifies on every request)
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
 * Returns the raw Response object for streaming or custom handling.
 */
export async function authFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  // If Content-Type not set and body is not FormData, default to JSON
  if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(input, {
    ...init,
    headers,
  })
  if (res.status === 401) {
    // Token expired or invalid — clear local auth and redirect to login
    clearAuth()
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  return res
}