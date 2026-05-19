import { useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import { confirmAccountTransfer, type AccountTransferData } from '../lib/api'

interface Props {
  data: AccountTransferData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function AccountTransferCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmAccountTransfer(data)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: could not complete transfer (${msg}). Try again via chat.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium text-sm">Account transfer</p>
        <p className="text-muted text-xs mt-0.5">{data.date}</p>
      </div>

      {/* From → To */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white">{data.from_account_name}</span>
          <span className="text-red-400">-€{data.amount.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1 text-muted text-xs">
          <ArrowRight size={12} />
          <span>€{data.amount.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white">{data.to_account_name}</span>
          <span className="text-green-400">+€{data.amount.toFixed(2)}</span>
        </div>
      </div>

      {data.notes && (
        <p className="text-muted text-xs">{data.notes}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-40"
        >
          <Check size={14} />
          {loading ? 'Processing…' : 'Confirm'}
        </button>
        <button
          onClick={onCancelled}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-40"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
