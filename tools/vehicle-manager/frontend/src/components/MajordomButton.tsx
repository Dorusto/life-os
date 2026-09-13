import { Sparkles } from 'lucide-react'
import { cn } from '../lib/ui'

interface MajordomButtonProps {
  /** Allows the host surface (the desktop rail pads its own controls) to align it. */
  className?: string
}

/**
 * Resolves Majordom Finance's chat URL. Separate deployables on separate
 * origins (Finance is on its own port), so the host comes from config with the
 * local/docker-dev default as the fallback — never a hardcoded literal. Mirrors
 * the `baseUrl(configured, fallback)` convention in pages/Settings.tsx.
 */
function financeChatUrl(): string {
  const configured = import.meta.env.VITE_MAJORDOM_FINANCE_URL as string | undefined
  const value = configured && configured.trim() ? configured.trim() : 'http://localhost:3000'
  return `${value.replace(/\/+$/, '')}/chat`
}

/**
 * Majordom chat entry point (#12). Sits as a sibling of SettingsButton and
 * NotificationBell in every shell surface, and follows SettingsButton's markup
 * exactly (same icon size, same tokens, caller-supplied alignment className).
 *
 * Finance is a different origin, so this is a plain anchor opening in a new tab
 * — not a react-router `Link`, and definitely not a chat client or iframe.
 */
export default function MajordomButton({ className }: MajordomButtonProps) {
  return (
    <a
      href={financeChatUrl()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Majordom chat"
      title="Majordom chat"
      className={cn('flex items-center text-ink-3 transition-colors hover:text-ink', className)}
    >
      <Sparkles size={16} aria-hidden />
    </a>
  )
}
