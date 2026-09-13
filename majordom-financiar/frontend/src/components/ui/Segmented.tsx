import { cn } from '../../lib/ui'

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** Small segmented control for period/allocation switches. */
export function Segmented<T extends string>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn('inline-flex rounded border border-token-line-strong bg-token-surface p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-sm px-2.5 py-1 text-[12px] font-medium transition-colors',
            value === option.value ? 'bg-token-brand text-white' : 'text-token-ink-2 hover:text-token-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
