import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Car, ChevronDown } from 'lucide-react'
import type { Vehicle } from '../lib/api'
import { formatNumber } from '../lib/formatCurrency'
import { cn } from '../lib/ui'

const LISTBOX_ID = 'vehicle-switcher-listbox'

/**
 * Fuelio-style vehicle header: shows the active vehicle and lets the user
 * switch between them from any main screen. A native <select> is stretched
 * over the card so the whole thing is tappable without custom dropdown code.
 */
export default function VehicleSwitcher({
  vehicles,
  selectedId,
  onSelect,
}: {
  vehicles: Vehicle[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const vehicle = vehicles.find((v) => v.id === selectedId) ?? vehicles[0]
  const canSwitch = vehicles.length > 1
  const selectedIndex = vehicle ? vehicles.findIndex((v) => v.id === vehicle.id) : -1

  // Dismiss on any outside click/tap.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  // Move focus onto the current row so arrow keys work the moment the list opens.
  useEffect(() => {
    if (!open) return
    optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus()
  }, [open, selectedIndex])

  const close = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const pick = (id: number) => {
    onSelect(id)
    close(true)
  }

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = vehicles.length - 1
    const current = optionRefs.current.findIndex((el) => el === document.activeElement)
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        close(true)
        break
      case 'ArrowDown':
        event.preventDefault()
        optionRefs.current[current < last ? current + 1 : 0]?.focus()
        break
      case 'ArrowUp':
        event.preventDefault()
        optionRefs.current[current > 0 ? current - 1 : last]?.focus()
        break
      case 'Home':
        event.preventDefault()
        optionRefs.current[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        optionRefs.current[last]?.focus()
        break
      // Hand focus back to the trigger, then let Tab continue from there.
      case 'Tab':
        close(true)
        break
      default:
        break
    }
  }

  if (vehicle) {
    const odo = vehicle.last_odo ?? vehicle.manual_mileage
    const cardClass = 'rounded-lg border border-line bg-surface px-4 py-3 shadow-sm'
    const cardBody = (
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken">
          <Car size={17} className="text-ink-3" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{vehicle.name}</p>
          <p className="font-mono text-xs text-ink-3">
            {odo != null ? `${formatNumber(odo)} km` : 'No odometer yet'}
          </p>
        </div>
        {canSwitch && (
          <ChevronDown
            size={16}
            className={cn('flex-shrink-0 text-ink-3 transition-transform', open && 'rotate-180')}
          />
        )}
      </div>
    )

    // Single vehicle means there is nothing to switch to: keep the plain,
    // non-interactive card (same guard as the old hidden <select>).
    if (!canSwitch) {
      return <div className={cardClass}>{cardBody}</div>
    }

    return (
      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault()
              close(true)
            }
          }}
          aria-label="Select vehicle"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? LISTBOX_ID : undefined}
          className={cn(
            cardClass,
            'block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          )}
        >
          {cardBody}
        </button>

        {open && (
          <div
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Select vehicle"
            onKeyDown={onListKeyDown}
            className="absolute left-0 right-0 top-full z-20 mt-2 flex flex-col gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-lg"
          >
            {vehicles.map((v, index) => {
              const isSelected = v.id === vehicle.id
              return (
                <button
                  key={v.id}
                  ref={(el) => {
                    optionRefs.current[index] = el
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => pick(v.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors',
                    isSelected
                      ? 'bg-brand-soft font-medium text-brand-ink'
                      : 'text-ink hover:bg-surface-2',
                  )}
                >
                  <Car size={16} className="flex-shrink-0 opacity-60" aria-hidden />
                  <span className="truncate">{v.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-sm text-ink-3">
      No vehicles yet
    </div>
  )
}
