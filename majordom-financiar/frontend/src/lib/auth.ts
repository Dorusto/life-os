/**
 * Auth helpers — JWT token storage and retrieval.
 *
 * Why localStorage (not cookies)?
 * - Cookies require SameSite/Secure config that's awkward on a private Tailscale network.
 * - This app is on a private network, not the public internet — CSRF is not a concern.
 * - localStorage is simpler and works identically on all mobile browsers.
 */

import { setAbDown } from './abConnectionStatus'

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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Decode a JWT payload segment into its parsed JSON. JWT segments are
 * base64URL (RFC 7515: '-'/'_' instead of '+', no '=' padding), which plain
 * atob() rejects outright — any payload containing those characters throws
 * and, inside isAuthenticated(), read as "not authenticated" (spurious
 * logouts, audit finding 51). The decoded bytes are also UTF-8, which atob's
 * latin1 string would mangle for any non-ASCII payload (usernames with
 * diacritics), so decode the raw bytes through TextDecoder. Dependency-free.
 * Throws on malformed input — callers wrap in try/catch. Exported for tests.
 */
export function decodeJwtPayload(segment: string): unknown {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token) return false

  // Decode JWT payload (no verification — the server verifies on every request)
  // Just check the expiry locally so we can redirect to login proactively.
  try {
    const payload = decodeJwtPayload(token.split('.')[1]) as { exp: number }
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

/**
 * Authenticated fetch wrapper that automatically adds the JWT token.
 * Returns the raw Response object for streaming or custom handling.
 */
export async function authFetch(
  input: RequestInfo,
  init?: RequestInit,
  opts?: { redirectOn401?: boolean; abBacked?: boolean }
): Promise<Response> {
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
  if (res.status === 503) {
    // Distinguish "AB unreachable" (backend/main.py's ActualBudgetUnavailableError
    // handler, #254) from any other 503 a proxy might return — clone() so the
    // caller can still read the original body.
    try {
      const body = await res.clone().json()
      if (body && typeof body.error_type === 'string') {
        setAbDown(true)
      }
    } catch {
      // Not JSON / not the expected shape — not an AB-down 503, ignore.
    }
  } else if (res.ok && opts?.abBacked) {
    // Clear the AB-down flag only on success from an endpoint that actually
    // talks to Actual Budget (call sites opt in via `abBacked: true` — see
    // lib/api.ts's abRequest). A 200 from anything else proves nothing about
    // AB: chat streams its LLM reply fine while its AB tools fail inside, so
    // an unconditional clear made the #254 banner flicker away (audit finding
    // 57). The 503 arm above stays global — any endpoint can surface an AB
    // outage, since ActualBudgetUnavailableError propagates from wherever the
    // AB client was called.
    setAbDown(false)
  }
  if (res.status === 401 && opts?.redirectOn401 !== false) {
    // Token expired or invalid — clear local auth and redirect to login
    clearAuth()
    window.location.href = '/login'
    throw new ApiError(401, 'Session expired')
  }
  // redirectOn401: false — a 401 here isn't a session issue (e.g. a login
  // attempt, where it means "wrong password"). Return the response as-is so
  // the caller reads the real error detail from the body, same as any other
  // non-ok response.
  return res
}