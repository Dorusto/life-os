import { cx } from '../shell/cx'

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** Small segmented control for period/view switches — same pill style as PageHeader tabs. */
export function Segmented<T extends string>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div role="tablist" className={cx('inline-flex gap-0.5 rounded-full border border-line bg-surface p-[3px]', className)}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-full px-3 py-1 font-mono text-xs transition-colors',
            value === option.value ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
