import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/ui'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-token-brand text-white hover:bg-token-brand-2 border border-transparent',
  secondary: 'bg-token-surface text-token-ink border border-token-line-strong hover:bg-token-surface-2',
  ghost: 'bg-transparent text-token-ink-2 border border-transparent hover:bg-token-surface-2 hover:text-token-ink',
  danger: 'bg-token-surface text-token-loss border border-token-loss hover:bg-token-loss-soft',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-[2.5rem] px-4 text-sm',
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
        'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  )
}
