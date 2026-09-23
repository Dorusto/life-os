import { useSyncExternalStore } from 'react'

/**
 * Privacy mode ("hide amounts", #308): one switch that masks every money figure, for showing
 * the screen to someone else. Money formatters check `amountsHidden()` and return MASK; the
 * shell remounts the page when the switch flips, so every figure re-renders at once.
 * Stored per device (per app origin).
 */
export const MASK = '••••'

const KEY = 'majordom_hide_amounts'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let hidden = typeof window !== 'undefined' ? read() : false

export function amountsHidden(): boolean {
  return hidden
}

export function setAmountsHidden(next: boolean): void {
  hidden = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Storage blocked: the switch still applies until the page reloads.
  }
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current state, re-rendering the caller when it flips. */
export function useAmountsHidden(): boolean {
  return useSyncExternalStore(subscribe, amountsHidden, () => false)
}
