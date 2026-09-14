import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/auth'
import { AppShell } from './components/AppShell'
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

export default function App() {
  const protectedPage = (node: React.ReactNode) => (
    <ProtectedRoute>
      <AppShell>{node}</AppShell>
    </ProtectedRoute>
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
        <Route path="/import" element={protectedPage(<FuelioImport />)} />
        <Route path="/settings" element={protectedPage(<Settings />)} />
        {/* Catch-all: redirect unknown paths home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
