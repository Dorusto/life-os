import { Link } from 'react-router-dom'
import { Car, Landmark, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { APP_LINKS, type AppId } from './appLinks'
import { cx } from './cx'

export type DomainId = 'spending' | 'net-worth' | 'investments' | 'vehicles'

interface Domain {
  id: DomainId
  label: string
  icon: LucideIcon
  app: AppId
  path: string
}

/** The four top-level views of the whole platform, in display order. */
const DOMAINS: Domain[] = [
  { id: 'spending', label: 'Spending', icon: Wallet, app: 'finance', path: '/' },
  { id: 'net-worth', label: 'Net worth', icon: Landmark, app: 'finance', path: '/net-worth' },
  { id: 'investments', label: 'Investments', icon: TrendingUp, app: 'invest', path: '/' },
  { id: 'vehicles', label: 'Vehicles', icon: Car, app: 'transport', path: '/' },
]

/**
 * Segmented switcher across the platform's dashboards (Wealthfolio's Investments / Net Worth /
 * Spending row). Rendered at the top of each app's home page, so the three apps read as one:
 * a tab in the current app is a router link, a tab in another app is a real page load.
 * On phones only the active tab shows its label; the others are icons.
 * Sized to its content (never full width) and owns its bottom margin, so every home page
 * gets the same row; on phones it stops short of the shell's top-right privacy/bell cluster.
 */
export function DomainTabs({ app, active }: { app: AppId; active: DomainId }) {
  return (
    <nav aria-label="Dashboards" className="mb-5 flex w-fit max-w-[calc(100%-5.5rem)] gap-0.5 rounded-full border border-line bg-surface p-[3px] lg:max-w-full">
      {DOMAINS.map(({ id, label, icon: Icon, app: target, path }) => {
        const isActive = id === active
        const cls = cx(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-xs transition-colors',
          isActive ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink',
        )
        const content = (
          <>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className={cx(!isActive && 'hidden sm:inline')}>{label}</span>
          </>
        )
        return target === app ? (
          <Link key={id} to={path} aria-label={label} aria-current={isActive ? 'page' : undefined} className={cls}>{content}</Link>
        ) : (
          <a key={id} href={`${APP_LINKS[target].url}${path === '/' ? '' : path}`} aria-label={label} className={cls}>{content}</a>
        )
      })}
    </nav>
  )
}
