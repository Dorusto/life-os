import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Self-hosted fonts — bundled by Vite, no runtime CDN dependency, so the app
// renders correctly on a private network. Latin + latin-ext only (covers
// Romanian diacritics) rather than every @fontsource subset. Same approach as
// investment-manager; see src/styles/tokens.css for the font tokens.
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-ext-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-ext-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-ext-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-ext-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-ext-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-ext-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-ext-600.css'

// Design tokens are imported at the very top of index.css (index.css →
// src/styles/tokens.css), so they're in the cascade before any Tailwind layer
// that reads them. Single source of truth: src/styles/tokens.css.
import App from './App'
import './index.css'

// QueryClient handles server state: caching, refetching, loading/error states.
// Same retry/backoff shape as majordom-financiar's own main.tsx, minus the
// service-worker/push-notification registration (not relevant here).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 401 — the user needs to log in, not wait for retries
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status
        if (status === 401) return false
        return failureCount < 4 // up to 4 retries: 1s + 2s + 4s + 8s = 15s
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8_000),
      staleTime: 30_000,
      // After all retries fail (e.g. backend not yet ready after a reboot),
      // keep polling every 5s until data loads — avoids needing a manual refresh.
      refetchInterval: (query) => {
        if (query.state.status === 'error' && !query.state.data) return 5_000
        return false
      },
      refetchIntervalInBackground: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
