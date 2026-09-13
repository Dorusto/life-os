import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { changeTextClass, cn } from '../../lib/ui'
import { formatCurrency, formatPercent } from '../../lib/formatCurrency'

/**
 * A signed change, rendered consistently: direction icon + value, colored by
 * sign. `value` is a fraction (0.032 → "+3.2%") and `eur` an optional
 * absolute EUR amount shown alongside.
 */
export function Delta({
  value,
  eur,
  className,
  digits = 1,
}: {
  value: number | null | undefined
  eur?: number | null
  className?: string
  digits?: 0 | 1
}) {
  if (value === null || value === undefined) {
    return <span className={cn('text-token-ink-3', className)}>—</span>
  }
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium tnum', changeTextClass(value), className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {formatPercent(value * 100, { decimals: digits, signDisplay: 'always' })}
      {eur !== undefined && eur !== null && (
        <span className="font-normal text-token-ink-3">({formatCurrency(eur, { signDisplay: 'always' })})</span>
      )}
    </span>
  )
}
