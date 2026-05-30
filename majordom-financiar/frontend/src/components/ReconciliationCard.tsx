import { useState } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'

interface ReconciliationCardProps {
  accountName: string
  balance: number
  importedCount: number
  onDismiss: () => void
  onAdjust: (realBalance: number) => void
}

export default function ReconciliationCard({
  accountName,
  balance,
  importedCount,
  onDismiss,
  onAdjust,
}: ReconciliationCardProps) {
  const [showInput, setShowInput] = useState(false)
  const [inputValue, setInputValue] = useState('')

  function handleNoSubmit() {
    const parsed = parseFloat(inputValue.replace(',', '.'))
    if (isNaN(parsed)) return
    onAdjust(parsed)
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-4 max-w-[420px] w-full space-y-3">
      <p className="text-white text-sm">
        Imported {importedCount} transaction{importedCount !== 1 ? 's' : ''}. Balance for{' '}
        <span className="font-medium">{accountName}</span> is now{' '}
        <span className="font-medium text-accent">€{balance.toFixed(2)}</span>.
        Does this match your banking app?
      </p>

      {!showInput ? (
        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            <CheckCircle size={14} />
            Yes
          </button>
          <button
            onClick={() => setShowInput(true)}
            className="flex-1 py-2 rounded-xl border border-border text-muted hover:text-white hover:bg-surface-hover text-sm transition-colors"
          >
            No, it's different
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-yellow-500 flex-shrink-0" />
            <p className="text-yellow-500 text-xs">Enter the balance shown in your banking app</p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">€</span>
              <input
                autoFocus
                type="number"
                step="0.01"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNoSubmit()}
                placeholder="2387.50"
                className="w-full bg-background border border-border rounded-xl pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <button
              onClick={handleNoSubmit}
              disabled={!inputValue.trim()}
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Adjust
            </button>
            <button
              onClick={() => setShowInput(false)}
              className="px-3 py-2 rounded-xl border border-border text-muted hover:text-white text-sm transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
