import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Camera, Upload, PenLine } from 'lucide-react'
import BottomSheet from './BottomSheet'

/**
 * Persistent "+ Add" entry point, present in every tab's header
 * (decisions.md#nav-five-tabs). Photo routes to the receipt scan, CSV to the
 * import flow, and Manual to the same review screen in manual mode (#185) — no
 * chat/LLM involvement.
 */
export default function AddButton() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-accent hover:bg-accent-hover transition-colors text-white font-semibold text-sm"
      >
        <Plus size={16} />
        Add
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add Transaction">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { setOpen(false); navigate('/receipt') }}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface-2 hover:bg-white/5 transition-colors text-left"
          >
            <Camera size={18} className="text-accent flex-shrink-0" />
            <div>
              <p className="text-white text-sm font-semibold">Photo</p>
              <p className="text-muted text-xs">Scan a receipt, AI proposes the details</p>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); navigate('/import') }}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface-2 hover:bg-white/5 transition-colors text-left"
          >
            <Upload size={18} className="text-accent flex-shrink-0" />
            <div>
              <p className="text-white text-sm font-semibold">CSV</p>
              <p className="text-muted text-xs">Import a bank export</p>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); navigate('/receipt', { state: { manual: true } }) }}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface-2 hover:bg-white/5 transition-colors text-left"
          >
            <PenLine size={18} className="text-accent flex-shrink-0" />
            <div>
              <p className="text-white text-sm font-semibold">Manual entry</p>
              <p className="text-muted text-xs">No AI involved — you fill in every field</p>
            </div>
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
