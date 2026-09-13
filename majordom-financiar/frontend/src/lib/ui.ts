import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Conditional + conflict-free Tailwind class merging. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']

/** Stable categorical color for a slice index (wraps after six). */
export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length]
}

/** Text color for a signed change: gain, loss, or neutral ink. */
export function changeTextClass(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return 'text-token-ink-2'
  return value > 0 ? 'text-token-gain' : 'text-token-loss'
}
