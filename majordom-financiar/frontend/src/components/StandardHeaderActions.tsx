import { useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import IconButton from './IconButton'
import AddButton from './AddButton'
import NotificationBell from './NotificationBell'

/**
 * Shared header-right cluster for Dashboard/Accounts/Transactions/Analytics —
 * Add + Notifications + Settings, same three everywhere
 * (decisions.md#nav-five-tabs), replacing the old per-page kebab menu.
 *
 * `variant` lets review/detail pages reuse the same component rather than
 * copying markup: 'no-add' drops Add where adding is meaningless, and
 * 'bell-only' is for Settings, which must not link to itself. Default output
 * ('full') is unchanged.
 */
export type StandardHeaderActionsVariant = 'full' | 'no-add' | 'bell-only'

interface StandardHeaderActionsProps {
  variant?: StandardHeaderActionsVariant
}

export default function StandardHeaderActions({ variant = 'full' }: StandardHeaderActionsProps) {
  const navigate = useNavigate()
  return (
    <>
      {variant === 'full' && <AddButton />}
      <NotificationBell />
      {variant !== 'bell-only' && (
        <IconButton icon={Settings} onClick={() => navigate('/settings')} label="Settings" />
      )}
    </>
  )
}
