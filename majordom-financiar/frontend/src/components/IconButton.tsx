import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface IconButtonProps {
  icon: LucideIcon
  onClick: () => void
  label: string
  size?: number
  variant?: 'default' | 'danger'
  disabled?: boolean
  iconClassName?: string
  /** Small absolutely-positioned overlay, e.g. a failure dot. */
  badge?: ReactNode
}

/** Single icon-button style shared by every page header/menu — size, padding, hover all in one place so a new one added later can't silently drift. */
export default function IconButton({
  icon: Icon, onClick, label, size = 20, variant = 'default', disabled, iconClassName = '', badge,
}: IconButtonProps) {
  const colorClass = variant === 'danger' ? 'text-muted hover:text-danger' : 'text-muted hover:text-white'

  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`relative p-2 rounded-xl ${colorClass} hover:bg-surface transition-colors disabled:opacity-60`}
    >
      <Icon size={size} className={iconClassName} />
      {badge}
    </button>
  )
}
