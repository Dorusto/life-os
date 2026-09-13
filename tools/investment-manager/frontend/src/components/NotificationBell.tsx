import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'

interface NotificationBellProps {
  /** Icon-button styling supplied by the shell group so the bell matches the gear. */
  buttonClassName: string
}

interface NotificationItem {
  id: string
  title: string
  detail?: string
}

/**
 * No notification source exists yet: the backend (`app/`) has no notification
 * table or endpoint and `lib/api.ts` exposes no notification fetch. The list
 * therefore stays empty and the popup says so, rather than inventing alerts or
 * a fabricated count.
 */
const notifications: NotificationItem[] = []

/**
 * Shell bell: the toolbar button plus a popup anchored under it. The popup
 * stays in normal DOM flow (no full-screen fixed overlay) and is height-capped
 * and scrollable, so it can never be clipped at the top of the viewport.
 */
export function NotificationBell({ buttonClassName }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className={buttonClassName}
        aria-label="Notifications"
        title="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-lg border border-line bg-surface shadow-lg"
        >
          {notifications.length > 0 ? (
            <ul>
              {notifications.map((item) => (
                <li key={item.id} className="border-b border-line px-4 py-3 last:border-b-0">
                  <p className="text-[13px] font-medium text-ink">{item.title}</p>
                  {item.detail && <p className="mt-0.5 text-[12px] text-ink-2">{item.detail}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13px] text-ink-2">No notifications</p>
          )}
        </div>
      )}
    </div>
  )
}
