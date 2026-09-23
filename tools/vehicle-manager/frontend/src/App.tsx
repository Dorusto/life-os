import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { clearAuth, getUsername, isAuthenticated } from './lib/auth'
import { NAV_TABS } from './lib/navTabs'
import { AppShell } from './components/shell/AppShell'
import { APP_LINKS } from './components/shell/appLinks'
import { Page } from './components/shell/Page'
import NotificationBell from './components/NotificationBell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import VehicleList from './pages/VehicleList'
import VehicleDetail from './pages/VehicleDetail'
import TimelinePage from './pages/TimelinePage'
import StatsPage from './pages/StatsPage'
import RemindersPage from './pages/RemindersPage'
import FuelioImport from './pages/FuelioImport'
import Settings from './pages/Settings'

/**
 * ProtectedRoute: redirects to /login if the user is not authenticated.
 * Checked client-side (JWT expiry in localStorage) — the server also
 * verifies on every API call, this is just for UX, not security. Same
 * pattern as majordom-financiar's own ProtectedRoute.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

/**
 * Renders one page inside the shared Majordom shell. It lives in its own
 * component only because `useNavigate` needs to run under the router — the same
 * shape as Invest's `Protected` in ../investment-manager/frontend/src/App.tsx.
 * The shell owns scrolling, the rail/tab-bar navigation, notifications,
 * settings, the chat link and log out; pages render only their own content.
 */
function Protected({ children, width = 'wide' }: { children: React.ReactNode; width?: 'wide' | 'narrow' }) {
  const navigate = useNavigate()

  const logout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <ProtectedRoute>
      <AppShell
        app="transport"
        nav={NAV_TABS}
        chat={{ href: `${APP_LINKS.finance.url}/chat` }}
        settingsTo="/settings"
        notifications={<NotificationBell />}
        username={getUsername()}
        onLogout={logout}
      >
        <Page width={width}>{children}</Page>
      </AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  const protectedPage = (node: React.ReactNode, width: 'wide' | 'narrow' = 'wide') => (
    <Protected width={width}>{node}</Protected>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={protectedPage(<Dashboard />)} />
        <Route path="/vehicles" element={protectedPage(<VehicleList />)} />
        <Route path="/vehicles/:id" element={protectedPage(<VehicleDetail />)} />
        <Route path="/timeline" element={protectedPage(<TimelinePage />)} />
        <Route path="/stats" element={protectedPage(<StatsPage />)} />
        <Route path="/reminders" element={protectedPage(<RemindersPage />)} />
        <Route path="/import" element={protectedPage(<FuelioImport />, 'narrow')} />
        <Route path="/settings" element={protectedPage(<Settings />, 'narrow')} />
        {/* Catch-all: redirect unknown paths home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
