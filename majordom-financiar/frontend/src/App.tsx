import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAuthenticated } from './lib/auth'
import { requestAndSubscribe } from './lib/push'
import { getSetupStatus } from './lib/api'
import Login from './pages/Login'
import AbSetupWizard from './pages/AbSetupWizard'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import AccountDetail from './pages/AccountDetail'
import TransactionsPage from './pages/Transactions'
import AnalyticsPage from './pages/Analytics'
import SettingsPage from './pages/Settings'
import ReceiptFlow from './pages/ReceiptFlow'
import ImportPage from './pages/ImportPage'
import DuplicatesReviewPage from './pages/DuplicatesReviewPage'
import UncategorizedReviewPage from './pages/UncategorizedReviewPage'
import UnreconciledReviewPage from './pages/UnreconciledReviewPage'
import BudgetRealismReviewPage from './pages/BudgetRealismReviewPage'
import RecurringReviewPage from './pages/RecurringReviewPage'
import Chat, { type Message, INITIAL_MESSAGES } from './pages/Chat'
import { getChatHistory } from './lib/api'
import BottomNav from './components/BottomNav'
import AbConnectionBanner from './components/AbConnectionBanner'
import { AppShell } from './components/AppShell'

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
 * Routes where the bottom nav should NOT be shown.
 * Full-screen flows (login, receipt scan, AB setup) handle their own navigation.
 */
const HIDE_NAV_ON = ['/login', '/receipt', '/setup/ab']

function Layout() {
  const location = useLocation()
  const showNav = !HIDE_NAV_ON.some(p => location.pathname.startsWith(p))
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
      <AppShell>
      <div className="lg:mx-auto lg:max-w-5xl">
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
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receipt"
          element={
            <ProtectedRoute>
              <ReceiptFlow />
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
        {/* Catch-all: redirect unknown paths to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      </AppShell>

      {/* Bottom nav rendered outside Routes so it persists across page changes */}
      {showNav && isAuthenticated() && <BottomNav />}
      <AbConnectionBanner />
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
