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
      {/* dvh (not vh) so mobile browser chrome doesn't push the panel off-screen.
          Flex column: header stays fixed, only the body scrolls. */}
      <div
        className="w-full bg-token-surface border-t border-token-line rounded-t-2xl flex flex-col max-h-[85dvh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-token-ink font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-token-ink-3 hover:text-token-ink transition-colors flex-shrink-0 ml-3">
            <X size={18} />
          </button>
        </div>
        {/* min-h-0 lets this flex child actually shrink so it can scroll. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-8 text-token-ink-3 text-xs leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  )
}
