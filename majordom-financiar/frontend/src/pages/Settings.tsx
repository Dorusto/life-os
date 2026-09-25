import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  ChevronRight, LogOut, RefreshCw, Wallet, Database, Car, LineChart,
  Languages, Settings2, ShieldCheck, Coins, Tags, Users, CalendarClock,
  ArrowRightLeft, Sparkles, Plug, Link2, Bell, Info, Monitor, Check,
  Lock, Unplug, Hash, TrendingUp, EyeOff, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  syncAccounts, getPayees, getSchedules, getBackupStatus, getCategories, getCategoryGroups,
  getBudgetPacingConfig, saveBudgetPacingConfig, getSetupStatus, getVehicleCostsSummary,
  getInvestmentStatus,
  getFireExcludedAccounts, saveFireExcludedAccounts, getAccountList,
  type PayeeItem, type ScheduleItem,
} from '../lib/api'
import { isAbDown, subscribeAbDown } from '../lib/abConnectionStatus'
import { clearAuth } from '../lib/auth'
import { requestAndSubscribe } from '../lib/push'
import { APP_LINKS } from '../components/shell/appLinks'
import { PageHeader } from '../components/shell/PageHeader'
import { AppearanceSettings } from '../components/shell/AppearanceSettings'
import { Button } from '../components/kit/Button'

type PageKey =
  | 'menu'
  | 'language'
  | 'general'
  | 'security-backup'
  | 'currencies'
  | 'categories'
  | 'payees'
  | 'schedules'
  | 'import-export'
  | 'ai'
  | 'ai-integrations'
  | 'connections'
  | 'notifications'
  | 'budget-pacing'
  | 'fire-exclusions'
  | 'about'

type SubPageKey = Exclude<PageKey, 'menu'>

const SUBPAGE_TITLES: Record<SubPageKey, string> = {
  language: 'Language',
  general: 'General',
  'security-backup': 'Security & backup',
  currencies: 'Currencies',
  categories: 'Categories',
  payees: 'Payees',
  schedules: 'Scheduled payments',
  'import-export': 'Import & Export',
  ai: 'AI',
  'ai-integrations': 'AI Integrations',
  connections: 'Connections',
  notifications: 'Notifications',
  'budget-pacing': 'Annual budget pacing',
  'fire-exclusions': 'FIRE excluded accounts',
  about: 'About',
}

interface MenuItem {
  key: SubPageKey
  label: string
  icon: LucideIcon
}

const MENU_GROUPS: { label: string; items: MenuItem[] }[] = [
  {
    label: 'Personal',
    items: [
      { key: 'language', label: 'Language', icon: Languages },
      { key: 'general', label: 'General', icon: Settings2 },
      { key: 'security-backup', label: 'Security & backup', icon: ShieldCheck },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { key: 'currencies', label: 'Currencies', icon: Coins },
      { key: 'categories', label: 'Categories', icon: Tags },
      { key: 'payees', label: 'Payees', icon: Users },
      { key: 'schedules', label: 'Scheduled payments', icon: CalendarClock },
      { key: 'import-export', label: 'Import & Export', icon: ArrowRightLeft },
      { key: 'ai', label: 'AI', icon: Sparkles },
      { key: 'ai-integrations', label: 'AI Integrations', icon: Plug },
      { key: 'budget-pacing', label: 'Annual budget pacing', icon: TrendingUp },
      { key: 'fire-exclusions', label: 'FIRE excluded accounts', icon: EyeOff },
    ],
  },
  { label: 'Connections', items: [{ key: 'connections', label: 'Connections', icon: Link2 }] },
  { label: 'Notifications', items: [{ key: 'notifications', label: 'Notifications', icon: Bell }] },
  { label: 'About', items: [{ key: 'about', label: 'About', icon: Info }] },
]

export default function Settings() {
  const [page, setPage] = useState<PageKey>('menu')

  if (page === 'menu') {
    return <MenuScreen onNavigate={setPage} />
  }

  return (
    <SubPageShell title={SUBPAGE_TITLES[page]} onBack={() => setPage('menu')}>
      <PageBody page={page} />
    </SubPageShell>
  )
}

// ---------- Menu ----------

function MenuScreen({ onNavigate }: { onNavigate: (page: SubPageKey) => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'failed'>('idle')

  async function handleSync() {
    setSyncState('syncing')
    try {
      await syncAccounts()
      await queryClient.invalidateQueries({ queryKey: ['home'] })
      await queryClient.invalidateQueries({ queryKey: ['account-list'] })
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
      await queryClient.invalidateQueries({ queryKey: ['duplicates', 'months'] })
      await queryClient.invalidateQueries({ queryKey: ['uncategorized-groups'] })
      await queryClient.invalidateQueries({ queryKey: ['home-pending'] })
      setSyncState('idle')
    } catch {
      setSyncState('failed')
    }
  }

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex flex-col">
      {/* No actions: the shell's rail already carries the bell and the way back
          to the Dashboard, and a page header must not duplicate global controls. */}
      <PageHeader eyebrow="Majordom" title="Settings" />
      <section className="pt-2 space-y-6">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-token-ink-3 mb-2.5">Appearance</p>
          <AppearanceSettings appDefault="sage" />
        </div>

        <Button
          variant="secondary"
          onClick={handleSync}
          disabled={syncState === 'syncing'}
          className="w-full h-12 justify-start gap-3"
        >
          <RefreshCw size={16} className={`text-token-ink-3 flex-shrink-0 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
          <span className="flex-1 text-left text-sm font-semibold text-token-ink">
            {syncState === 'failed' ? 'Sync failed — tap to retry' : 'Sync accounts'}
          </span>
        </Button>

        {MENU_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-xs tracking-[0.2em] uppercase text-token-ink-3 mb-2.5">{group.label}</p>
            <div className="space-y-2">
              {group.items.map(item => (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  aria-label={item.label}
                  className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5 hover:border-token-line-strong transition-colors"
                >
                  <item.icon size={16} className="text-token-ink-3 flex-shrink-0" />
                  <span className="flex-1 text-left text-sm font-semibold text-token-ink">{item.label}</span>
                  <ChevronRight size={14} className="text-token-ink-3 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5 mt-2 hover:border-token-loss transition-colors"
        >
          <LogOut size={16} className="text-token-loss flex-shrink-0" />
          <span className="flex-1 text-left text-sm font-semibold text-token-loss">Log out</span>
        </button>
      </section>
    </div>
  )
}

// ---------- Sub-page shell ----------

function SubPageShell({
  title, onBack, children,
}: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      {/* The back control is a header `back`, not an action — AppShell owns the
          global controls, and a sub-page without it would be a dead end. */}
      <PageHeader eyebrow="Settings" title={title} back={{ onClick: onBack }} />
      <section className="pt-2 space-y-2.5">{children}</section>
    </div>
  )
}

function PageBody({ page }: { page: SubPageKey }) {
  switch (page) {
    case 'language': return <LanguagePage />
    case 'general': return <GeneralPage />
    case 'security-backup': return <SecurityBackupPage />
    case 'currencies': return <CurrenciesPage />
    case 'categories': return <CategoriesPage />
    case 'payees': return <PayeesPage />
    case 'schedules': return <SchedulesPage />
    case 'import-export': return <ImportExportPage />
    case 'ai': return <AiPage />
    case 'ai-integrations': return <AiIntegrationsPage />
    case 'connections': return <ConnectionsPage />
    case 'notifications': return <NotificationsPage />
    case 'budget-pacing': return <BudgetPacingPage />
    case 'fire-exclusions': return <FireExclusionsPage />
    case 'about': return <AboutPage />
  }
}

// ---------- Reusable row primitives ----------

/** Interactive row (navigates somewhere on tap). */
function NavRow({
  icon: Icon, title, onClick, ariaLabel,
}: { icon: LucideIcon; title: string; onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5 hover:border-token-line-strong transition-colors"
    >
      <Icon size={16} className="text-token-ink-3 flex-shrink-0" />
      <span className="flex-1 text-left text-sm font-semibold text-token-ink">{title}</span>
      <ChevronRight size={14} className="text-token-ink-3 flex-shrink-0" />
    </button>
  )
}

/** Inert placeholder row — looks like a setting but does nothing. */
function InertRow({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <div className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5">
      {Icon && <Icon size={16} className="text-token-ink-3 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-token-ink">{title}</p>
        {subtitle && <p className="text-xs text-token-ink-3 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

/** Row with a trailing value/status on the right (non-interactive). */
function StatusRow({ title, value, muted = false, icon: Icon }: { title: string; value: string; muted?: boolean; icon?: LucideIcon }) {
  return (
    <div className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5">
      {Icon && <Icon size={16} className="text-token-ink-3 flex-shrink-0" />}
      <span className="flex-1 text-sm font-semibold text-token-ink">{title}</span>
      <span className={`text-xs ${muted ? 'text-token-ink-3' : 'text-token-ink'} flex-shrink-0`}>{value}</span>
    </div>
  )
}

/** Checkmark row for "already active" selections. */
function ActiveRow({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <div className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5">
      {Icon && <Icon size={16} className="text-token-ink-3 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-token-ink">{title}</p>
        {subtitle && <p className="text-xs text-token-ink-3 mt-0.5">{subtitle}</p>}
      </div>
      <Check size={16} className="text-token-brand-ink flex-shrink-0" />
    </div>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-flex h-6 w-10 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-token-brand' : 'bg-token-line'}`}>
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full transition-transform ${on ? 'translate-x-4 bg-token-on-brand' : 'bg-token-ink-3'}`}
      />
    </span>
  )
}

function ToggleRow({
  title, subtitle, on, onToggle,
}: { title: string; subtitle?: string; on: boolean; onToggle?: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5 hover:border-token-line-strong transition-colors disabled:hover:border-token-line"
    >
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-semibold text-token-ink">{title}</p>
        {subtitle && <p className="text-xs text-token-ink-3 mt-0.5">{subtitle}</p>}
      </div>
      <Toggle on={on} />
    </button>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs tracking-[0.2em] uppercase text-token-ink-3 pt-3 mb-2.5">{children}</p>
}

// ---------- Personal ----------

function LanguagePage() {
  return (
    <ActiveRow
      title="English"
      subtitle="App UI is English-only, per project convention"
      icon={Languages}
    />
  )
}

function GeneralPage() {
  return (
    <>
      <InertRow title="Default account" subtitle="Not set" icon={Wallet} />
      <InertRow title="Include credit limits in balance" subtitle="Not built" />
      <InertRow title="Show archived accounts" subtitle="Not built" />
    </>
  )
}

function SecurityBackupPage() {
  const { data: backup } = useQuery({
    queryKey: ['backup-status'],
    queryFn: () => getBackupStatus(),
    staleTime: 60_000,
  })

  return (
    <>
      <SectionLabel>Security</SectionLabel>
      <InertRow title="Change password" icon={Lock} />
      <StatusRow title="Active session" value="This device" icon={Monitor} />

      <SectionLabel>Backup</SectionLabel>
      <StatusRow
        title="Last backup"
        value={backup?.last_backup ?? 'Unknown'}
        muted={!backup?.last_backup}
        icon={ShieldCheck}
      />
      <InertRow title="Run backup now" />
      <InertRow title="Restore from backup" />
    </>
  )
}

// ---------- Workspace ----------

function CurrenciesPage() {
  return (
    <div className="bg-token-surface border border-token-line rounded-2xl px-4 py-4">
      <p className="text-sm text-token-ink-3">
        Actual Budget tracks one currency per budget file, not per account — there's no
        per-account currency data to show here.
      </p>
    </div>
  )
}

function CategoriesPage() {
  const navigate = useNavigate()
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories(),
    staleTime: 120_000,
  })
  const { data: groups } = useQuery({
    queryKey: ['category-groups'],
    queryFn: () => getCategoryGroups(),
    staleTime: 120_000,
  })

  return (
    <>
      <StatusRow
        title="Categories"
        value={`${categories?.length ?? '…'} categories · ${groups?.length ?? '…'} groups`}
        icon={Tags}
      />
      <div className="pt-2">
        <NavRow icon={Sparkles} title="Open in Majordom chat" onClick={() => navigate('/chat')} />
      </div>
      <p className="text-xs text-token-ink-3 px-1 pt-1">
        Categories are managed conversationally in chat — this page is a live summary, not an editor.
      </p>
    </>
  )
}

function PayeesPage() {
  const { data: payees, isLoading } = useQuery({
    queryKey: ['payees'],
    queryFn: () => getPayees(),
    staleTime: 120_000,
  })

  if (isLoading) return <p className="text-sm text-token-ink-3 px-1">Loading…</p>
  if (!payees || payees.length === 0) return <p className="text-sm text-token-ink-3 px-1">No payees yet.</p>

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl px-4 py-1.5">
      {payees.map((p: PayeeItem) => (
        <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-token-line last:border-b-0">
          <span className="text-sm font-medium text-token-ink truncate">{p.name}</span>
          <span className="text-xs text-token-ink-3 flex-shrink-0">
            {p.transaction_count} transaction{p.transaction_count !== 1 ? 's' : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function SchedulesPage() {
  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => getSchedules(),
    staleTime: 120_000,
  })

  if (isLoading) return <p className="text-sm text-token-ink-3 px-1">Loading…</p>
  if (!schedules || schedules.length === 0) return <p className="text-sm text-token-ink-3 px-1">No scheduled payments.</p>

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl px-4 py-1.5">
      {schedules.map((s: ScheduleItem) => (
        <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-token-line last:border-b-0">
          <span className="text-sm font-medium text-token-ink truncate">{s.name}</span>
          <span className={`text-xs flex-shrink-0 ${s.active ? 'text-token-ink' : 'text-token-ink-3'}`}>
            {s.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      ))}
    </div>
  )
}

function ImportExportPage() {
  const navigate = useNavigate()
  return (
    <>
      <NavRow icon={ArrowRightLeft} title="Import CSV" onClick={() => navigate('/chat')} />
      <InertRow title="Export transactions" />
      <p className="text-xs text-token-ink-3 px-1 pt-1">
        CSV import runs from the chat input's + button / the Dashboard's Add sheet.
      </p>
    </>
  )
}

function AiPage() {
  return (
    <>
      <SectionLabel>Models</SectionLabel>
      <StatusRow title="Chat" value="deepseek/deepseek-chat" icon={Sparkles} />
      <StatusRow title="Vision" value="google/gemini-2.5-flash-lite" icon={Sparkles} />
      <StatusRow title="Local fallback" value="qwen3.5:9b" icon={Sparkles} />
      <p className="text-xs text-token-ink-3 px-1 pt-1">
        Models run via OpenRouter (local fallback via Ollama). Not editable here.
      </p>
    </>
  )
}

function AiIntegrationsPage() {
  return (
    <>
      <InertRow title="MCP server" subtitle="Inbound — not built yet" icon={Plug} />
      <p className="text-xs text-token-ink-3 px-1 pt-1">Tracked as a future roadmap item.</p>
    </>
  )
}

// ---------- Connections ----------

function ConnectionsPage() {
  const origin = `${window.location.protocol}//${window.location.hostname}`
  const actualBudgetUrl = import.meta.env.VITE_ACTUAL_BUDGET_URL || `${origin}:5006`
  // Vehicle and Invest are separate deployables on their own origins. APP_LINKS
  // resolves the same VITE_* variables as the app-shell nav, so this link can't
  // drift from the rail's.
  const vehicleAppUrl = APP_LINKS.transport.url
  const investmentUrl = APP_LINKS.invest.url

  // Honest status only (audit finding 79): every row has a real health chain —
  // Actual Budget via setup/status + the #254 reactive AB-down flag, Vehicle
  // Manager via the costs-summary proxy's `available` field, Investment Manager
  // via /investment/status (its unauthenticated GET /health).
  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ['setup-status', 'connections'],
    queryFn: () => getSetupStatus(),
    staleTime: 60_000,
  })
  const {
    data: vehicleData, isLoading: vehicleLoading, isError: vehicleError,
  } = useQuery({
    queryKey: ['vehicle-costs-summary', 'connections'],
    queryFn: () => getVehicleCostsSummary(),
    staleTime: 60_000,
  })
  const {
    data: investmentData, isLoading: investmentLoading, isError: investmentError,
  } = useQuery({
    queryKey: ['investment-status', 'connections'],
    queryFn: () => getInvestmentStatus(),
    staleTime: 60_000,
    // A deliberate "not available" is a normal answer, not an error, so don't
    // let the global retry/poll default hammer an optional service (#208).
    retry: false,
  })
  const [abDown, setAbDown] = useState(isAbDown())
  useEffect(() => subscribeAbDown(setAbDown), [])

  const abConnected = !abDown && setup?.ab_connected === true
  const actualBudgetStatus = abDown
    ? 'Connection lost'
    : setupLoading
      ? 'Checking…'
      : abConnected
        ? 'Connected'
        : 'Not configured'
  const vehicleConnected = !vehicleLoading && !vehicleError && vehicleData?.available === true
  const vehicleStatus = vehicleLoading
    ? 'Checking…'
    : vehicleError
      ? 'Status unknown'
      : vehicleConnected
        ? 'Connected'
        : 'Unreachable'
  const investmentConnected = !investmentLoading && !investmentError && investmentData?.available === true
  const investmentStatus = investmentLoading
    ? 'Checking…'
    : investmentError
      ? 'Status unknown'
      : investmentConnected
        ? 'Connected'
        : 'Unreachable'

  return (
    <>
      <a
        href={actualBudgetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5 hover:border-token-line-strong transition-colors"
      >
        <Wallet size={16} className="text-token-ink-3 flex-shrink-0" />
        <span className="flex-1 text-sm font-semibold text-token-ink">Actual Budget</span>
        <span className={`text-xs flex-shrink-0 ${abDown ? 'text-token-loss' : abConnected ? 'text-token-gain' : 'text-token-ink-3'}`}>
          {actualBudgetStatus}
        </span>
        <ChevronRight size={14} className="text-token-ink-3 flex-shrink-0" />
      </a>
      <a
        href={vehicleAppUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5 hover:border-token-line-strong transition-colors"
      >
        <Car size={16} className="text-token-ink-3 flex-shrink-0" />
        <span className="flex-1 text-sm font-semibold text-token-ink">Vehicle Manager</span>
        <span className={`text-xs flex-shrink-0 ${vehicleConnected ? 'text-token-gain' : vehicleStatus === 'Unreachable' ? 'text-token-loss' : 'text-token-ink-3'}`}>
          {vehicleStatus}
        </span>
        <ChevronRight size={14} className="text-token-ink-3 flex-shrink-0" />
      </a>
      <a
        href={investmentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5 hover:border-token-line-strong transition-colors"
      >
        <LineChart size={16} className="text-token-ink-3 flex-shrink-0" />
        <span className="flex-1 text-sm font-semibold text-token-ink">Investment Manager</span>
        <span className={`text-xs flex-shrink-0 ${investmentConnected ? 'text-token-gain' : investmentStatus === 'Unreachable' ? 'text-token-loss' : 'text-token-ink-3'}`}>
          {investmentStatus}
        </span>
        <ChevronRight size={14} className="text-token-ink-3 flex-shrink-0" />
      </a>
      {/* Majordom's own SQLite debug viewer — loopback-only since the tailscale-serve
          vs. 0.0.0.0 port conflict fix (2026-09-12/13), so no longer reachable from
          another device via this link. Kept for localhost-direct use, not removed. */}
      <a
        href={`${origin}:8888`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center gap-3 bg-token-surface border border-token-line rounded-2xl px-4 py-3.5 hover:border-token-line-strong transition-colors"
      >
        <Database size={16} className="text-token-ink-3 flex-shrink-0" />
        <span className="flex-1 text-sm font-semibold text-token-ink">Majordom Memory</span>
        <span className="text-xs text-token-ink-3 flex-shrink-0">Localhost only</span>
        <ChevronRight size={14} className="text-token-ink-3 flex-shrink-0" />
      </a>
    </>
  )
}

// ---------- Notifications ----------

// ---------- Budget pacing (#112) ----------

function BudgetPacingPage() {
  const queryClient = useQueryClient()
  const { data: config, isLoading, isError, error } = useQuery({
    queryKey: ['budget-pacing-config'],
    queryFn: () => getBudgetPacingConfig(),
    staleTime: 60_000,
  })

  const [annualIncome, setAnnualIncome] = useState('')
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set())
  const [sinkingIds, setSinkingIds] = useState<Set<string>>(new Set())
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Seed the form from the saved config exactly once, when it first loads —
  // not on every refetch, or an in-progress edit would get clobbered.
  useEffect(() => {
    if (config && !seeded) {
      setAnnualIncome(config.annual_income != null ? String(config.annual_income) : '')
      setFixedIds(new Set(config.fixed_category_ids))
      setSinkingIds(new Set(config.sinking_fund_category_ids))
      setSeeded(true)
    }
  }, [config, seeded])

  // A category can only be fixed OR sinking-fund, never both — the backend
  // (get_budget_pacing_totals() in client.py) silently prioritizes "fixed"
  // on a collision, which would make a sinking-fund toggle look accepted in
  // the UI but be ignored in the calculation. Enforced here instead of just
  // documented, so the two states can never actually collide.
  function toggle(
    set: Set<string>, setSet: (s: Set<string>) => void,
    otherSet: Set<string>, setOtherSet: (s: Set<string>) => void,
    id: string,
  ) {
    const next = new Set(set)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
      if (otherSet.has(id)) {
        const nextOther = new Set(otherSet)
        nextOther.delete(id)
        setOtherSet(nextOther)
      }
    }
    setSet(next)
  }

  async function handleSave() {
    const income = parseFloat(annualIncome)
    if (!income || income <= 0) {
      setSaveError('Enter a valid annual income.')
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      await saveBudgetPacingConfig({
        annual_income: income,
        fixed_category_ids: Array.from(fixedIds),
        sinking_fund_category_ids: Array.from(sinkingIds),
      })
      queryClient.invalidateQueries({ queryKey: ['budget-pacing-config'] })
      setSaved(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = `
    w-full px-4 py-3 rounded-xl bg-token-surface border border-token-line
    text-token-ink placeholder-token-ink-2 text-base
    focus:outline-none focus:border-token-brand focus:ring-1 focus:ring-token-brand
    transition-colors
  `

  if (isLoading) return <p className="text-sm text-token-ink-3 px-1">Loading…</p>
  if (isError) {
    return (
      <p className="text-token-ink-3 text-xs px-1">
        Couldn't load budget pacing config{error instanceof Error ? `: ${error.message}` : '.'}
      </p>
    )
  }

  return (
    <>
      <p className="text-xs text-token-ink-3 px-1">
        Discretionary spending is tracked against your annual income minus fixed expenses and
        sinking funds — Majordom only nudges you when you're over pace for the year, not every month.
      </p>

      <div className="flex flex-col gap-1.5 pt-2">
        <label htmlFor="annual-income" className="text-sm text-token-ink-3 px-1">Annual income (€)</label>
        <input
          id="annual-income"
          type="number"
          inputMode="decimal"
          min="0"
          value={annualIncome}
          onChange={e => setAnnualIncome(e.target.value)}
          placeholder="e.g. 60000"
          className={inputClass}
        />
      </div>

      <SectionLabel>Fixed expense categories</SectionLabel>
      {config?.categories.map(c => (
        <ToggleRow
          key={c.id}
          title={c.name}
          subtitle={c.group_name}
          on={fixedIds.has(c.id)}
          onToggle={() => toggle(fixedIds, setFixedIds, sinkingIds, setSinkingIds, c.id)}
        />
      ))}

      <SectionLabel>Sinking fund / goal categories</SectionLabel>
      {config?.categories.map(c => (
        <ToggleRow
          key={c.id}
          title={c.name}
          subtitle={c.group_name}
          on={sinkingIds.has(c.id)}
          onToggle={() => toggle(sinkingIds, setSinkingIds, fixedIds, setFixedIds, c.id)}
        />
      ))}

      {saveError && <p className="text-token-loss text-sm text-center pt-2">{saveError}</p>}
      {saved && <p className="text-token-gain text-sm text-center pt-2">Saved.</p>}

      <Button
        type="button"
        variant="secondary"
        disabled={saving}
        onClick={handleSave}
        className="mt-2 w-full h-12 text-base"
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </>
  )
}

// ---------- FIRE excluded accounts (#299) ----------

function FireExclusionsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fire-excluded-accounts'],
    queryFn: () => getFireExcludedAccounts(),
    staleTime: 60_000,
  })
  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
  })

  const [terms, setTerms] = useState<string[]>([])
  const [seeded, setSeeded] = useState(false)
  const [newTerm, setNewTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Seed the form from the saved list exactly once, when it first loads —
  // not on every refetch, or an in-progress edit would get clobbered.
  useEffect(() => {
    if (data && !seeded) {
      setTerms(data.terms)
      setSeeded(true)
    }
  }, [data, seeded])

  const offBudgetAccounts = (accounts ?? []).filter(a => a.off_budget)
  const dirty = data ? JSON.stringify(terms) !== JSON.stringify(data.terms) : false

  function addTerm(raw: string) {
    const term = raw.trim().toLowerCase()
    if (!term) return
    setTerms(prev => (prev.includes(term) ? prev : [...prev, term]))
    setNewTerm('')
    setSaved(false)
  }

  function removeTerm(term: string) {
    setTerms(prev => prev.filter(t => t !== term))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const res = await saveFireExcludedAccounts(terms)
      setTerms(res.terms)
      queryClient.invalidateQueries({ queryKey: ['fire-excluded-accounts'] })
      setSaved(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = `
    w-full px-4 py-3 rounded-xl bg-token-surface border border-token-line
    text-token-ink placeholder-token-ink-2 text-base
    focus:outline-none focus:border-token-brand focus:ring-1 focus:ring-token-brand
    transition-colors
  `

  if (isLoading) return <p className="text-sm text-token-ink-3 px-1">Loading…</p>
  if (isError) {
    return (
      <p className="text-token-ink-3 text-xs px-1">
        Couldn't load FIRE exclusions{error instanceof Error ? `: ${error.message}` : '.'}
      </p>
    )
  }

  return (
    <>
      <p className="text-xs text-token-ink-3 px-1">
        Off-budget accounts whose name contains one of these terms are left out of the FIRE portfolio.
      </p>

      <SectionLabel>Excluded terms</SectionLabel>
      {terms.length === 0 ? (
        <p className="text-sm text-token-ink-3 px-1">No exclusions — every off-budget account counts.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {terms.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => removeTerm(t)}
              aria-label={`Remove ${t}`}
              className="flex items-center gap-1.5 bg-token-surface border border-token-line rounded-full px-3 py-1.5 text-sm text-token-ink hover:border-token-line-strong transition-colors"
            >
              {t}
              <X size={12} className="text-token-ink-3 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <input
          aria-label="New exclusion"
          value={newTerm}
          onChange={e => setNewTerm(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTerm(newTerm) }}
          placeholder="e.g. pension"
          className={inputClass}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => addTerm(newTerm)}
          className="flex-shrink-0"
        >
          Add
        </Button>
      </div>

      {offBudgetAccounts.length > 0 && (
        <select
          aria-label="Add off-budget account"
          value=""
          onChange={e => { if (e.target.value) addTerm(e.target.value) }}
          className={inputClass}
        >
          <option value="">Add an off-budget account…</option>
          {offBudgetAccounts.map(a => (
            <option key={a.id} value={a.name}>{a.name}</option>
          ))}
        </select>
      )}

      {saveError && <p className="text-token-loss text-sm text-center pt-2">{saveError}</p>}
      {saved && <p className="text-token-gain text-sm text-center pt-2">Saved.</p>}

      <Button
        type="button"
        variant="secondary"
        disabled={saving || !dirty}
        onClick={handleSave}
        className="mt-2 w-full h-12 text-base"
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </>
  )
}

function NotificationsPage() {
  const [notifState, setNotifState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('granted')

  useEffect(() => {
    if (!('Notification' in window)) { setNotifState('unsupported'); return }
    setNotifState(Notification.permission as 'default' | 'granted' | 'denied')
  }, [])

  async function handleEnableNotifications() {
    const result = await requestAndSubscribe()
    setNotifState(result === 'unsupported' ? 'unsupported' : result)
  }

  const pushLabel = notifState === 'denied'
    ? 'Blocked in browser settings'
    : notifState === 'unsupported'
      ? 'Not supported on this device'
      : notifState === 'granted'
        ? 'Enabled'
        : 'Tap to enable'

  return (
    <>
      <ToggleRow
        title="Push notifications"
        subtitle={pushLabel}
        on={notifState === 'granted'}
        onToggle={notifState === 'denied' || notifState === 'unsupported' ? undefined : handleEnableNotifications}
      />
      <ToggleRow
        title="Daily digest"
        subtitle="Sent every day at 20:00 — always on"
        on
      />
    </>
  )
}

// ---------- About ----------

function AboutPage() {
  return (
    <>
      <StatusRow title="Version" value={__APP_VERSION__} icon={Hash} />
      <InertRow title="Disconnect Actual Budget" icon={Unplug} />
    </>
  )
}
