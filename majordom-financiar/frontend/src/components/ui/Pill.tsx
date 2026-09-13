import type { ReactNode } from 'react'
import { cn } from '../../lib/ui'

type Tone = 'neutral' | 'brand' | 'gain' | 'loss' | 'warn'

const TONES: Record<Tone, string> = {
  neutral: 'bg-token-surface-sunken text-token-ink-2 border-token-line',
  brand: 'bg-token-brand-soft text-token-brand-ink border-transparent',
  gain: 'bg-token-gain-soft text-token-gain border-transparent',
  loss: 'bg-token-loss-soft text-token-loss border-transparent',
  warn: 'bg-token-warn-soft text-token-warn border-transparent',
}

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const TYPE_TONES: Record<string, Tone> = {
  buy: 'brand',
  sell: 'warn',
  dividend: 'gain',
  fee: 'neutral',
}

export function TypePill({ type }: { type: string }) {
  return <Pill tone={TYPE_TONES[type] ?? 'neutral'}>{type.replace(/^\w/, (c) => c.toUpperCase())}</Pill>
}
