import { ArrowUpRight, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { clearAuth, getUsername } from '../lib/auth'

/**
 * The three Majordom apps run as separate origins (different ports) on the same
 * host, so these are real navigations, never router links. Ports are the compose
 * defaults in majordom-financiar/docker-compose.yml (`${WEB_PORT:-3000}` and
 * `${INVESTMENT_MANAGER_WEB_PORT:-3020}`); override per deployment with
 * VITE_MAJORDOM_FINANCE_URL / VITE_INVESTMENT_MANAGER_URL.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

function baseUrl(configured: string | undefined, fallback: string): string {
  const value = configured && configured.trim() ? configured.trim() : fallback
  return value.replace(/\/+$/, '')
}

const FINANCE_BASE = baseUrl(env.VITE_MAJORDOM_FINANCE_URL, 'http://localhost:3000')
const INVEST_BASE = baseUrl(env.VITE_INVESTMENT_MANAGER_URL, 'http://localhost:3020')

const APP_LINKS = [
  {
    label: 'Majordom Finance',
    description: 'Accounts, transactions and budgets',
    href: `${FINANCE_BASE}/settings`,
  },
  {
    label: 'Majordom Invest',
    description: 'Portfolio and investment tracking',
    href: `${INVEST_BASE}/settings`,
  },
]

function AppLink({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2.5 transition-colors hover:bg-surface-2"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-3">{description}</span>
      </span>
      <ArrowUpRight size={15} className="shrink-0 text-ink-3" aria-hidden />
    </a>
  )
}

/** App-local settings plus cross-app navigation, reachable from every screen's gear. */
export default function Settings() {
  const navigate = useNavigate()

  function handleSignOut() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-paper px-4 pb-24 pt-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
      </header>

      <Card title="Majordom apps" className="mt-3">
        <div className="space-y-2">
          {APP_LINKS.map((link) => (
            <AppLink key={link.href} {...link} />
          ))}
        </div>
      </Card>

      <Card title="Account" className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{getUsername() ?? 'Signed in'}</p>
            <p className="text-xs text-ink-3">Majordom Transport</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            <LogOut size={15} /> Sign out
          </Button>
        </div>
      </Card>

      <BottomNav />
    </div>
  )
}
