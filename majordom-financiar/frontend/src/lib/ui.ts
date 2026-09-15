import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Conditional + conflict-free Tailwind class merging. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}


