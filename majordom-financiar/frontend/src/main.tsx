import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// QueryClient handles server state: caching, refetching, loading/error states.
// We use it for all API calls so components don't need to manage fetch state manually.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 401 — the user needs to log in, not wait for retries
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status
        if (status === 401) return false
        return failureCount < 4  // up to 4 retries: 1s + 2s + 4s + 8s = 15s
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8_000),
      staleTime: 30_000,
      // After all retries fail (e.g. backend not yet ready after system reboot),
      // keep polling every 5s until data loads — avoids needing a manual refresh.
      refetchInterval: (query) => {
        if (query.state.status === 'error' && !query.state.data) return 5_000
        return false
      },
      refetchIntervalInBackground: false,
    },
  },
})

// Register Service Worker for PWA installability + offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker registration failed:', err)
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
