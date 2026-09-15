/**
 * Shared "is Actual Budget reachable right now" flag (#254), set by
 * authFetch() as a side effect of API responses and read by
 * AbConnectionBanner. Module-level, not React state — authFetch() lives
 * outside the component tree.
 *
 * Set (down=true) by any response carrying the backend's AB-down 503 shape
 * ({error_type}), from any endpoint. Cleared (down=false) ONLY by a 2xx from
 * an AB-backed request — call sites opt in via authFetch's `abBacked` flag
 * (lib/api.ts wraps this as abRequest). A 200 from a non-AB endpoint (chat
 * streaming, chat history, login, vehicle-manager proxies...) proves nothing
 * about AB health and must not clear the flag (audit finding 57).
 */

let abDown = false
const listeners = new Set<(down: boolean) => void>()

export function setAbDown(down: boolean): void {
  if (down === abDown) return
  abDown = down
  for (const cb of listeners) cb(abDown)
}

export function isAbDown(): boolean {
  return abDown
}

export function subscribeAbDown(cb: (down: boolean) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
