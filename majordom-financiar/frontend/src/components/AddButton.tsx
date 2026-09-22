import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Camera, Upload, PenLine } from 'lucide-react'
import BottomSheet from './BottomSheet'
import ReceiptFlow from '../pages/ReceiptFlow'

/**
 * Persistent "+ Add" entry point, present in every tab's header
 * (decisions.md#nav-five-tabs). Photo opens the device image picker and then
 * the receipt popup over the current page, CSV routes to the import flow, and
 * Manual opens the same popup in manual mode (#185, #296) — no chat/LLM
 * involvement, and no navigation away from the page you're on.
 */
type ReceiptEntry = { mode: 'photo'; file: File } | { mode: 'manual' }

export default function AddButton() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [entry, setEntry] = useState<ReceiptEntry | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Add transaction"
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-token-brand hover:bg-token-brand-2 transition-colors text-white font-semibold text-sm"
      >
        <Plus size={16} />
        Add
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add Transaction">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { setOpen(false); fileInputRef.current?.click() }}
            aria-label="Photo"
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-token-surface-2 hover:bg-white/5 transition-colors text-left"
          >
            <Camera size={18} className="text-token-brand-ink flex-shrink-0" />
            <div>
              <p className="text-token-ink text-sm font-semibold">Photo</p>
              <p className="text-token-ink-3 text-xs">Scan a receipt, AI proposes the details</p>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); navigate('/import') }}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-token-surface-2 hover:bg-white/5 transition-colors text-left"
          >
            <Upload size={18} className="text-token-brand-ink flex-shrink-0" />
            <div>
              <p className="text-token-ink text-sm font-semibold">CSV</p>
              <p className="text-token-ink-3 text-xs">Import a bank export</p>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); setEntry({ mode: 'manual' }) }}
            aria-label="Manual entry"
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-token-surface-2 hover:bg-white/5 transition-colors text-left"
          >
            <PenLine size={18} className="text-token-brand-ink flex-shrink-0" />
            <div>
              <p className="text-token-ink text-sm font-semibold">Manual entry</p>
              <p className="text-token-ink-3 text-xs">No AI involved — you fill in every field</p>
            </div>
          </button>
        </div>
      </BottomSheet>

      {/* No `capture` attribute: without it mobile browsers offer both the
          camera and the gallery. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const picked = e.target.files?.[0]
          // Reset so picking the same file again still fires onChange.
          e.target.value = ''
          if (picked) setEntry({ mode: 'photo', file: picked })
        }}
      />

      {entry && (
        <ReceiptFlow
          mode={entry.mode}
          file={entry.mode === 'photo' ? entry.file : undefined}
          onClose={() => setEntry(null)}
        />
      )}
    </>
  )
}
