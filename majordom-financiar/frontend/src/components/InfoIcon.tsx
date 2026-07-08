import { useState, type ReactNode } from 'react'
import BottomSheet from './BottomSheet'

interface InfoIconProps {
  title: string
  children: ReactNode
}

/**
 * Small "(i)" icon that opens a short explainer bottom sheet — for any card
 * metric that isn't immediately obvious (Coast FIRE, Portfolio Independence
 * target, a goal's description, etc.).
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

      <BottomSheet open={open} onClose={() => setOpen(false)} title="💡 What does this card mean?">
        {children}
      </BottomSheet>
    </>
  )
}
