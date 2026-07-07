import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface InfoIconProps {
  title: string
  children: ReactNode
}

/**
 * Small "(i)" icon that opens a short explainer bottom sheet — same overlay/sheet
 * pattern as Chat.tsx's help modal, reused here for any card metric that isn't
 * immediately obvious (Coast FIRE, Portfolio Independence target, etc.).
 */
export default function InfoIcon({ title, children }: InfoIconProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`About ${title}`}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-surface-2 text-muted text-[10px] font-bold italic ml-1.5 align-middle"
      >
        i
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          style={{ touchAction: 'none' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full bg-surface border-t border-border rounded-t-2xl px-6 pt-5 pb-8 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold text-base">{title}</h2>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="text-muted text-xs leading-relaxed">{children}</div>
          </div>
        </div>
      )}
    </>
  )
}
