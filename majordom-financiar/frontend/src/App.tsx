import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Layers, Table2, BarChart3 } from 'lucide-react'
import { clearAuth, getUsername, isAuthenticated } from './lib/auth'
import { requestAndSubscribe } from './lib/push'
import { getSetupStatus } from './lib/api'
import Login from './pages/Login'
import AbSetupWizard from './pages/AbSetupWizard'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import AccountDetail from './pages/AccountDetail'
import TransactionsPage from './pages/Transactions'
import AnalyticsPage from './pages/Analytics'
import NetWorthPage from './pages/NetWorth'
import SettingsPage from './pages/Settings'
import ImportPage from './pages/ImportPage'
import DuplicatesReviewPage from './pages/DuplicatesReviewPage'
import UncategorizedReviewPage from './pages/UncategorizedReviewPage'
import UnreconciledReviewPage from './pages/UnreconciledReviewPage'
import BudgetRealismReviewPage from './pages/BudgetRealismReviewPage'
import RecurringReviewPage from './pages/RecurringReviewPage'
import Chat, { type Message, INITIAL_MESSAGES } from './pages/Chat'
import { getChatHistory } from './lib/api'
import AbConnectionBanner from './components/AbConnectionBanner'
import NotificationBell from './components/NotificationBell'
import { AppShell, type ShellNavItem } from './components/shell/AppShell'
import { Page } from './components/shell/Page'

/**
 * ProtectedRoute: redirects to /login if the user is not authenticated.
 * Checked client-side (JWT expiry in localStorage). The server also verifies
 * on every API call — this is just for UX, not security.
 *
 * Also gates on the AB setup wizard (#190) being complete, via AbConnectedGate
 * below — pass `skipAbCheck` for the wizard's own route, to avoid a redirect
 * loop (same reason /login is never itself wrapped in ProtectedRoute).
 */
function ProtectedRoute({ children, skipAbCheck }: { children: React.ReactNode; skipAbCheck?: boolean }) {
  const location = useLocation()

  if (!isAuthenticated()) {
    // Carry the requested path through the login round trip (#12) — a cross-app
    // /majordom?prefill=… deep link must land on chat afterwards, not Dashboard.
    // A `?next=` query param (rather than router state) because it survives the
    // replace-navigation to /login and a full page load.
    const params = new URLSearchParams({ next: location.pathname + location.search })
    return <Navigate to={`/login?${params.toString()}`} replace />
  }
  if (skipAbCheck) {
    return <>{children}</>
  }
  return <AbConnectedGate>{children}</AbConnectedGate>
}

/**
 * Redirects to the AB setup wizard if Actual Budget hasn't been connected yet
 * (#190) — only reached once ProtectedRoute's own auth check already passed.
 * Renders nothing while the check is in flight, to avoid a flash of whatever
 * page was actually requested before we know whether AB is connected.
 */
function AbConnectedGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['setup-status', 'ab-connected-gate'],
    queryFn: getSetupStatus,
    staleTime: 60_000,
  })

  if (isLoading) return null
  if (data && !data.ab_connected) {
    return <Navigate to="/setup/ab" replace />
  }
  return <>{children}</>
}

/**
 * `/majordom` is the cross-app entry point other apps link to (#12). Chat's
 * canonical route stays `/chat` (BottomNav and the notification bell both rely
 * on it) — this only forwards, carrying the query string so a link such as
 * `/majordom?prefill=…` still prefills the input (a cross-app link can't carry
 * router state, but it can carry a query param).
 */
function MajordomRedirect() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/chat', search: location.search }} replace />
}

/**
 * Shell destinations. Order matters: `MobileTabBar` puts the first two and the
 * third destination around the centre Majordom chat button, while `MoreSheet`
 * lists `nav.slice(3)` — so Accounts deliberately sits last, behind More
 * (decisions.md#nav-five-tabs), keeping the bar to five buttons.
 */
const NAV: ShellNavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/transactions', label: 'Transactions', icon: Table2 },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/accounts', label: 'Accounts', icon: Layers },
]

/**
 * The shared shell, mounted exactly once around every protected route via a
 * pathless layout route + <Outlet/> (not one <AppShell> per page). The shell
 * owns the rail / floating tab bar, scrolling, notifications, Settings and
 * Log out — this wrapper only picks the content width (`wide` for pages,
 * `narrow` for Settings' form column) through the shared <Page>, which also
 * supplies the page padding, so pages no longer add their own px-* gutters.
 * `h-full` is Chat-only: Chat fills the available height, which needs a parent
 * with a definite height (the shell's <main> is `h-dvh` and renders its
 * children directly). Every other page must NOT get a height class — capping
 * the page box to the shell's content height makes long pages overflow that
 * box, so <main>'s pb-28 (room for the tab bar) lands before the real end of
 * the content and the last lines hide under the tab bar.
 */
function ShellLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const isSettings = location.pathname.startsWith('/settings')
  const isChat = location.pathname.startsWith('/chat')

  return (
    <AppShell
      app="finance"
      nav={NAV}
      chat={{ to: '/chat' }}
      settingsTo="/settings"
      notifications={<NotificationBell />}
      username={getUsername()}
      onLogout={() => {
        clearAuth()
        navigate('/login', { replace: true })
      }}
    >
      <Page width={isSettings ? 'narrow' : 'wide'} className={isChat ? 'h-full pb-0 lg:pb-8' : undefined}>
        <AbConnectionBanner />
        <Outlet />
      </Page>
    </AppShell>
  )
}

function Layout() {
  const [chatMessages, setChatMessages] = useState<Message[]>(INITIAL_MESSAGES)
  // Lifted above <Chat/> (rather than local state there) so a half-typed message
  // survives navigating away and back — <Chat/> only mounts on the /chat route,
  // so component-local state would otherwise reset every time.
  const [chatInput, setChatInput] = useState('')
  const chatMessagesRef = useRef(chatMessages)
  useEffect(() => { chatMessagesRef.current = chatMessages }, [chatMessages])

  useEffect(() => {
    if (isAuthenticated()) {
      requestAndSubscribe()
    }
  }, [])

  // Load chat history from server on mount and when window regains focus
  // (covers the case where a push notification arrives while chat is open)
  function loadChatHistory() {
    if (!isAuthenticated()) return
    // Skip if there are active cards — replacing state would discard them.
    // chart/transaction_list don't count: they're read-only display data that
    // is itself persisted server-side (architecture.md rule 17 corollary) and
    // restored from history below, so treating them as active permanently
    // blocked reload for the whole session (audit 2026-09-15 finding 60).
    const hasActiveCards = chatMessagesRef.current.some(
      m => m.role !== 'user' && m.role !== 'assistant' && m.role !== 'status' &&
        m.role !== 'chart' && m.role !== 'transaction_list'
    )
    if (hasActiveCards) return
    getChatHistory().then(msgs => {
      if (msgs.length > 0) {
        setChatMessages(msgs.map(m => {
          if (m.role === 'chart') {
            try {
              return { role: 'chart' as const, content: '', chart: JSON.parse(m.content), ts: m.ts, _synced: true }
            } catch {
              // Malformed/legacy stored payload — fall through to plain text so
              // the message doesn't just disappear.
            }
          }
          if (m.role === 'transaction_list') {
            try {
              return { role: 'transaction_list' as const, content: '', transactionList: JSON.parse(m.content), ts: m.ts, _synced: true }
            } catch {
              // Malformed/legacy stored payload — fall through to plain text so
              // the message doesn't just disappear.
            }
          }
          return { role: m.role as Message['role'], content: m.content, ts: m.ts, _synced: true }
        }))
      }
    }).catch(() => {})
  }

  useEffect(() => {
    loadChatHistory()
    // visibilitychange fires when user switches apps — NOT on keyboard dismiss (unlike focus)
    const onVisible = () => { if (document.visibilityState === 'visible') loadChatHistory() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/setup/ab"
          element={
            <ProtectedRoute skipAbCheck>
              <AbSetupWizard />
            </ProtectedRoute>
          }
        />
        {/* Pathless layout route: AppShell (desktop rail, mobile floating tab
            bar) wraps every protected page exactly once, replacing the old
            per-page wrapper plus the separate <BottomNav /> that used to be
            rendered outside <Routes>. /login and /setup/ab stay outside it —
            they own their full-screen flows. */}
        <Route element={<ShellLayout />}>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <Accounts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/:id"
            element={
              <ProtectedRoute>
                <AccountDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <TransactionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          {/* Reached by the platform-wide DomainTabs "Net worth" tab, deliberately
              not in NAV — the rail stays at five destinations. */}
          <Route
            path="/net-worth"
            element={
              <ProtectedRoute>
                <NetWorthPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/import"
            element={
              <ProtectedRoute>
                <ImportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/duplicates"
            element={
              <ProtectedRoute>
                <DuplicatesReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/uncategorized-review"
            element={
              <ProtectedRoute>
                <UncategorizedReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/unreconciled-review"
            element={
              <ProtectedRoute>
                <UnreconciledReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budget-realism-review"
            element={
              <ProtectedRoute>
                <BudgetRealismReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recurring-review"
            element={
              <ProtectedRoute>
                <RecurringReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat messages={chatMessages} setMessages={setChatMessages} input={chatInput} setInput={setChatInput} />
              </ProtectedRoute>
            }
          />
          {/* Cross-app entry point (#12) — other apps link to /majordom. */}
          <Route
            path="/majordom"
            element={
              <ProtectedRoute>
                <MajordomRedirect />
              </ProtectedRoute>
            }
          />
        </Route>
        {/* Catch-all: redirect unknown paths to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
