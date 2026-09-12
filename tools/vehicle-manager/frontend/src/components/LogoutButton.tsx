import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { clearAuth } from '../lib/auth'

/**
 * Always-reachable logout control (#266). `auth.ts` already exposes
 * `clearAuth()` and uses it on a 401; this is the user-initiated counterpart.
 * Placed in every authenticated page's header so no screen is a dead end.
 */
export default function LogoutButton() {
  const navigate = useNavigate()

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      aria-label="Log out"
      className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm"
    >
      <LogOut size={15} />
      <span>Log out</span>
    </button>
  )
}
