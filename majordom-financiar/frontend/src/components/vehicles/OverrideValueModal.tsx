import { useEffect, useState, type FormEvent } from 'react'
import BottomSheet from '../BottomSheet'
import { submitValueOverride } from '../../lib/vehicleValueApi'

interface OverrideValueModalProps {
  open: boolean
  onClose: () => void
  vehicleId: number
  currentValue: number
  onSaved: () => void
}

const inputClass =
  'bg-background text-white border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors w-full'
const labelClass = 'text-[11px] font-semibold text-muted uppercase tracking-wide'

export default function OverrideValueModal({
  open,
  onClose,
  vehicleId,
  currentValue,
  onSaved,
}: OverrideValueModalProps) {
  const [mode, setMode] = useState<'set' | 'adjust'>('set')
  const [value, setValue] = useState('')
  const [changeAmount, setChangeAmount] = useState('')
  const [direction, setDirection] = useState<'up' | 'down'>('down')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMode('set')
      setValue('')
      setChangeAmount('')
      setDirection('down')
      setDate(new Date().toISOString().slice(0, 10))
      setNote('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const amount = Number.parseFloat(mode === 'set' ? value : changeAmount)
    if (!Number.isFinite(amount)) {
      setError('Enter a valid amount')
      return
    }

    const body =
      mode === 'set'
        ? {
            mode: 'set' as const,
            value: amount,
            date,
            note: note.trim() || undefined,
          }
        : {
            mode: 'adjust' as const,
            value: amount,
            direction,
            date,
            note: note.trim() || undefined,
          }

    try {
      await submitValueOverride(vehicleId, body)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to override value')
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Override value">
      <form onSubmit={handleSubmit} className="space-y-3 pt-2">
        <div className="flex items-center gap-1 bg-background rounded-full p-1 border border-border w-fit">
          <button
            type="button"
            onClick={() => setMode('set')}
            className={`text-[11px] font-semibold px-3.5 py-1 rounded-full transition-colors ${
              mode === 'set' ? 'bg-accent text-white' : 'text-muted hover:text-white'
            }`}
          >
            Set value
          </button>
          <button
            type="button"
            onClick={() => setMode('adjust')}
            className={`text-[11px] font-semibold px-3.5 py-1 rounded-full transition-colors ${
              mode === 'adjust' ? 'bg-accent text-white' : 'text-muted hover:text-white'
            }`}
          >
            Adjust value
          </button>
        </div>

        {mode === 'set' ? (
          <div className="space-y-1">
            <label className={labelClass}>New value</label>
            <input
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={e => setValue(e.target.value)}
              className={inputClass}
              placeholder={currentValue ? currentValue.toFixed(2) : '0.00'}
            />
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className={labelClass}>Change amount</label>
              <input
                autoFocus
                inputMode="decimal"
                value={changeAmount}
                onChange={e => setChangeAmount(e.target.value)}
                className={inputClass}
                placeholder="1000.00"
              />
            </div>
            <div className="flex items-center gap-1 bg-background rounded-full p-1 border border-border w-fit">
              <button
                type="button"
                onClick={() => setDirection('up')}
                className={`text-[11px] font-semibold px-3.5 py-1 rounded-full transition-colors ${
                  direction === 'up' ? 'bg-accent text-white' : 'text-muted hover:text-white'
                }`}
              >
                Value up
              </button>
              <button
                type="button"
                onClick={() => setDirection('down')}
                className={`text-[11px] font-semibold px-3.5 py-1 rounded-full transition-colors ${
                  direction === 'down' ? 'bg-accent text-white' : 'text-muted hover:text-white'
                }`}
              >
                Value down
              </button>
            </div>
          </>
        )}

        <div className="space-y-1">
          <label className={labelClass}>Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Note (optional)</label>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            className={inputClass}
            placeholder="e.g. sale appraisal, mileage shock"
          />
        </div>

        {error && <p className="text-danger text-xs">{error}</p>}

        <button
          type="submit"
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-full py-2.5 text-sm font-semibold transition-colors"
        >
          Save override
        </button>
      </form>
    </BottomSheet>
  )
}
