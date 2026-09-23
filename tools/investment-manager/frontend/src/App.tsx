import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { clearAuth, getUsername, isAuthenticated } from './lib/auth'
import { NAV } from './lib/navigation'
import { AppShell } from './components/shell/AppShell'
import { APP_LINKS } from './components/shell/appLinks'
import { Page } from './components/shell/Page'
import { NotificationBell } from './components/NotificationBell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Holdings from './pages/Holdings'
import Transactions from './pages/Transactions'
import Income from './pages/Income'
import Rebalancing from './pages/Rebalancing'
import Goals from './pages/Goals'
import SettingsPage from './pages/Settings'

const bellButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

/**
 * Client-side guard for UX only — the API verifies every request server-side.
 * A hard refresh on any protected route re-checks the stored token here, and
 * Nginx serves the SPA shell for it because the backend lives under /api/.
 */
function Protected({ children, width = 'wide' }: { children: React.ReactNode; width?: 'wide' | 'narrow' }) {
  const navigate = useNavigate()
  if (!isAuthenticated()) return <Navigate to="/login" replace />

  const logout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <AppShell
      app="invest"
      nav={NAV}
      chat={{ href: `${APP_LINKS.finance.url}/chat` }}
      settingsTo="/settings"
      notifications={<NotificationBell buttonClassName={bellButtonClass} />}
      username={getUsername()}
      onLogout={logout}
    >
      <Page width={width}>{children}</Page>
    </AppShell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/holdings" element={<Protected><Holdings /></Protected>} />
        <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
        <Route path="/income" element={<Protected><Income /></Protected>} />
        <Route path="/rebalancing" element={<Protected><Rebalancing /></Protected>} />
        <Route path="/goals" element={<Protected><Goals /></Protected>} />
        <Route path="/settings" element={<Protected width="narrow"><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
