import { useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import IconButton from './IconButton'
import AddButton from './AddButton'
import NotificationBell from './NotificationBell'

/**
 * Shared header-right cluster for Dashboard/Accounts/Transactions/Analytics —
 * Add + Notifications + Settings, same three everywhere
 * (decisions.md#nav-five-tabs), replacing the old per-page kebab menu.
 */
export default function StandardHeaderActions() {
  const navigate = useNavigate()
  return (
    <>
      <AddButton />
      <NotificationBell />
      <IconButton icon={Settings} onClick={() => navigate('/settings')} label="Settings" />
    </>
  )
}
