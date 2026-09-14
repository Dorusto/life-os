import { NavLink } from 'react-router-dom'
import { destinationsFor } from '../lib/navigation'
import { Modal } from './Modal'

/**
 * Secondary destinations that don't fit in the mobile bottom tab bar.
 * Presented through the shared `Modal` (bottom-sheet on mobile, centered
 * dialog on desktop), matching the app's existing overlay conventions.
 * Desktop never opens this — the sidebar rail lists every destination.
 */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="More">
      <nav className="-mx-5 -my-5">
        {destinationsFor('more').map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className="flex items-center gap-3 border-b border-line px-5 py-4 text-sm font-medium text-ink last:border-b-0 hover:bg-surface-2"
          >
            <Icon className="h-[18px] w-[18px] text-ink-2" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </Modal>
  )
}
