import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware className merge — same helper as the other apps in this monorepo. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Colour a signed change consistently across the app. */
export function changeTextClass(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return 'text-ink-2'
  return value > 0 ? 'text-gain' : 'text-loss'
}
