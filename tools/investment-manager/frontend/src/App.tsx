import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isAuthenticated } from './lib/auth'
import { AppShell } from './components/AppShell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Holdings from './pages/Holdings'
import Transactions from './pages/Transactions'
import Income from './pages/Income'
import Rebalancing from './pages/Rebalancing'
import Goals from './pages/Goals'
import SettingsPage from './pages/Settings'

/**
 * Client-side guard for UX only — the API verifies every request server-side.
 * A hard refresh on any protected route re-checks the stored token here, and
 * Nginx serves the SPA shell for it because the backend lives under /api/.
 */
function Protected({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return <AppShell>{children}</AppShell>
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
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
