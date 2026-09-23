import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { isAbDown, subscribeAbDown } from '../lib/abConnectionStatus'

/**
 * Persistent, non-dismissible banner shown app-wide when Actual Budget
 * becomes unreachable after setup (#254) — server down, or the password
 * changed directly on AB. Distinct from NotificationBell's Inbox occupants:
 * those are dismissible findings with proof: this is "the tool doesn't work
 * right now," so it isn't routed through that component/pattern.
 *
 * Rendered inside the shell's content column (App.tsx ShellLayout), sticky at the
 * top of the scroll area — a fixed full-width bar covered the rail and headers.
 */
export default function AbConnectionBanner() {
  const [down, setDown] = useState(isAbDown())
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => subscribeAbDown(setDown), [])

  // Don't tell the user to go reconnect while they're already on that screen.
  if (!down || location.pathname.startsWith('/setup/ab')) return null

  return (
    <div className="sticky top-0 z-40 mb-4 flex items-center gap-2.5 rounded-lg border border-token-loss bg-token-loss-soft px-4 py-2.5">
      <AlertTriangle size={16} className="text-token-loss flex-shrink-0" />
      <span className="flex-1 text-sm font-medium text-token-loss">
        AB connection lost
      </span>
      <button
        onClick={() => navigate('/setup/ab')}
        className="text-sm font-semibold text-token-loss underline underline-offset-2 flex-shrink-0"
      >
        Reconnect
      </button>
    </div>
  )
}
