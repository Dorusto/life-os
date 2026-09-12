export interface BarItem {
  label: string
  value: number
  percentage: number
  color: string
}

/** Horizontal proportion bars — the table-like counterpart to the donut. */
export function BarList({
  items,
  formatValue,
}: {
  items: BarItem[]
  formatValue: (value: number) => string
}) {
  if (!items.length) {
    return <p className="py-6 text-center text-sm text-ink-3">Nothing to show yet.</p>
  }
  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <ul className="space-y-3.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-ink-2">{item.label}</span>
            <span className="shrink-0 font-mono tnum text-[13px] text-ink">
              {formatValue(item.value)}
              <span className="ml-2 text-ink-3">{item.percentage.toFixed(1)}%</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max((item.value / max) * 100, 1)}%`, background: item.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
