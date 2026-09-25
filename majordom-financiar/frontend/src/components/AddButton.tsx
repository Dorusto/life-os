import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Camera, Image, Upload, PenLine } from 'lucide-react'
import BottomSheet from './BottomSheet'
import ReceiptFlow from '../pages/ReceiptFlow'

/**
 * Persistent "+ Add" entry point, present in every tab's header
 * (decisions.md#nav-five-tabs). Take photo opens the rear camera and Choose
 * from gallery opens the photo picker — both then show the receipt popup over
 * the current page. CSV routes to the import flow, and Manual opens the same
 * popup in manual mode (#185, #296) — no chat/LLM involvement, and no
 * navigation away from the page you're on.
 */
type ReceiptEntry = { mode: 'photo'; file: File } | { mode: 'manual' }

export default function AddButton() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [entry, setEntry] = useState<ReceiptEntry | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // Shared by both photo inputs — reset so picking the same file again still
  // fires onChange, then hand the file to the receipt popup.
  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (picked) setEntry({ mode: 'photo', file: picked })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Add transaction"
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-token-brand hover:bg-token-brand-2 transition-colors text-token-on-brand font-semibold text-sm"
      >
        <Plus size={16} />
        Add
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add Transaction">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { setOpen(false); cameraInputRef.current?.click() }}
            aria-label="Take photo"
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-token-surface-2 hover:bg-white/5 transition-colors text-left"
          >
            <Camera size={18} className="text-token-brand-ink flex-shrink-0" />
            <div>
              <p className="text-token-ink text-sm font-semibold">Take photo</p>
              <p className="text-token-ink-3 text-xs">Scan a receipt with the camera, AI proposes the details</p>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); galleryInputRef.current?.click() }}
            aria-label="Choose from gallery"
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-token-surface-2 hover:bg-white/5 transition-colors text-left"
          >
            <Image size={18} className="text-token-brand-ink flex-shrink-0" />
            <div>
              <p className="text-token-ink text-sm font-semibold">Choose from gallery</p>
              <p className="text-token-ink-3 text-xs">Pick a receipt photo you already have</p>
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

      {/* Two inputs: `capture` forces the rear camera, its absence opens the
          gallery/photo picker. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFilePicked}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFilePicked}
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
