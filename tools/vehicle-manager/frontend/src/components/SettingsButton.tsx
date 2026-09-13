import { Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/ui'

interface SettingsButtonProps {
  /** Allows the host surface (the desktop rail pads its own controls) to align it. */
  className?: string
}

/**
 * Settings entry for every screen (#10/#21). Reproduces majordom-financiar's
 * shared top-right gear (`StandardHeaderActions` -> `IconButton icon={Settings}`)
 * locally: same icon, same sizing, same tokens. Separate deployables, so this is
 * a copy of the pattern, not an import across apps.
 */
export default function SettingsButton({ className }: SettingsButtonProps) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      aria-label="Settings"
      title="Settings"
      className={cn('flex items-center text-ink-3 transition-colors hover:text-ink', className)}
    >
      <Settings size={16} aria-hidden />
    </button>
  )
}
