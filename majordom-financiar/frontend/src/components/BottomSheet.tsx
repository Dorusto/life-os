import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * Shared bottom-sheet overlay — used by InfoIcon, Chat's help modal, and
 * Home's Needs Resolving list. One shell for backdrop/z-index/padding/scroll
 * lock so each caller can't quietly drift from the others (found live:
 * InfoIcon had a dark backdrop and z-[60], Chat's help modal had neither).
 */
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end bg-black/60"
      style={{ touchAction: 'none' }}
      onClick={onClose}
    >
      <div
        className="w-full bg-surface border-t border-border rounded-t-2xl px-6 pt-5 pb-8 space-y-3 max-h-[80vh] overflow-y-auto overscroll-contain"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors flex-shrink-0 ml-3">
            <X size={18} />
          </button>
        </div>
        <div className="text-muted text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  )
}
