import { NavLink } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { destinationsFor } from '../lib/navigation'
import { cn } from '../lib/ui'

function tabClass(active: boolean): string {
  return cn(
    'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors',
    active ? 'text-brand-ink' : 'text-ink-3 hover:text-ink',
  )
}

/**
 * Fixed bottom tab bar for mobile, mirroring the sibling vehicle-manager app.
 * Hidden at `lg:` and above, where the desktop sidebar rail takes over.
 * The trailing "More" tab is not a route — it reports taps via `onMoreClick`
 * so the parent (AppShell) owns the More-sheet state. Screens that render it
 * reserve bottom padding (`pb-20`) so content never sits under it.
 */
export function MobileBottomNav({ onMoreClick, moreOpen }: { onMoreClick: () => void; moreOpen: boolean }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[20] border-t border-line bg-surface lg:hidden">
      <div className="flex items-stretch">
        {destinationsFor('tabs').map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => tabClass(isActive)}>
            <Icon size={18} aria-hidden />
            {label}
          </NavLink>
        ))}
        {/* Not a route, so it lives outside the shared destination list. */}
        <button
          type="button"
          onClick={onMoreClick}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={tabClass(moreOpen)}
        >
          <MoreHorizontal size={18} aria-hidden />
          More
        </button>
      </div>
    </nav>
  )
}
