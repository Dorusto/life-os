import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { confirmCategoryAction, cancelCategoryAction, type CategoryActionData } from '../lib/api'

interface Props {
  data: CategoryActionData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function CategoryActionCard({ data, onConfirmed, onCancelled }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const result = await confirmCategoryAction(data.id)
      onConfirmed(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      onConfirmed(`Error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try { await cancelCategoryAction(data.id) } catch {}
    onCancelled()
  }

  const isDelete = data.action === 'delete'

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] space-y-3">
      <div>
        <p className="text-white font-medium">
          {isDelete ? 'Delete category?' : 'Rename category?'}
        </p>
        {isDelete ? (
          <p className="text-muted text-sm mt-0.5">
            <span className="text-white">{data.category_name}</span>
            {' '}will be removed. Existing transactions won't be lost.
          </p>
        ) : (
          <p className="text-muted text-sm mt-0.5">
            <span className="text-white">{data.category_name}</span>
            {' → '}
            <span className="text-white">{data.new_name}</span>
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50 ${
            isDelete
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-accent hover:bg-accent-hover'
          }`}
        >
          <Check size={14} />
          {isDelete ? 'Delete' : 'Rename'}
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-hover border border-border text-muted hover:text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-50"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  )
}
