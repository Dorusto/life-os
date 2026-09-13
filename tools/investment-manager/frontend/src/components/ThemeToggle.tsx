import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/ui'

/** Compact light/dark switch for the nav rail footer. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'flex w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {dark ? <Moon className="h-[17px] w-[17px]" aria-hidden /> : <Sun className="h-[17px] w-[17px]" aria-hidden />}
      {dark ? 'Dark mode' : 'Light mode'}
    </button>
  )
}
