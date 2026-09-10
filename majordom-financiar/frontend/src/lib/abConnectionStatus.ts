/**
 * Shared "is Actual Budget reachable right now" flag (#254), set by
 * authFetch() as a side effect of any real API response and read by
 * AbConnectionBanner. Module-level, not React state — authFetch() lives
 * outside the component tree.
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
