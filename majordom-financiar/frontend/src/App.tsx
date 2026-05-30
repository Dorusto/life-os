import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { isAuthenticated } from './lib/auth'
import { requestAndSubscribe } from './lib/push'
import Login from './pages/Login'
import Home from './pages/Home'
import ReceiptFlow from './pages/ReceiptFlow'
import ImportPage from './pages/ImportPage'
import Chat, { type Message, INITIAL_MESSAGES } from './pages/Chat'
import BottomNav from './components/BottomNav'

/**
 * ProtectedRoute: redirects to /login if the user is not authenticated.
 * Checked client-side (JWT expiry in localStorage). The server also verifies
 * on every API call — this is just for UX, not security.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

/**
 * Routes where the bottom nav should NOT be shown.
 * Full-screen flows (login, receipt scan) handle their own navigation.
 */
const HIDE_NAV_ON = ['/login', '/receipt']

function Layout() {
  const location = useLocation()
  const showNav = !HIDE_NAV_ON.some(p => location.pathname.startsWith(p))
  const [chatMessages, setChatMessages] = useState<Message[]>(INITIAL_MESSAGES)

  useEffect(() => {
    if (isAuthenticated()) {
      requestAndSubscribe()
    }
  }, [])

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
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
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat messages={chatMessages} setMessages={setChatMessages} />
            </ProtectedRoute>
          }
        />
        {/* Catch-all: redirect unknown paths to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Bottom nav rendered outside Routes so it persists across page changes */}
      {showNav && isAuthenticated() && <BottomNav />}
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
