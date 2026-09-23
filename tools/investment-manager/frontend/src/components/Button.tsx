import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/ui'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md'

/** Exported with the maps below so `ButtonLink` cannot drift from `Button`. */
export const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors'

export const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-2 border border-transparent',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-surface text-loss border border-loss hover:bg-loss-soft',
}

export const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        BUTTON_BASE,
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    />
  )
}
