/**
 * Cross-app links.
 *
 * The Majordom chat lives in the Finance app (majordom-financiar), which runs as
 * a separate origin — locally via docker-compose at http://localhost:3000.
 * Because of that, navigating there is a real page load, not a router route.
 *
 * Set VITE_MAJORDOM_FINANCE_URL to the deployed Finance base URL outside local
 * dev; the localhost fallback below is only correct for the local stack.
 */
const MAJORDOM_FINANCE_URL =
  (import.meta.env.VITE_MAJORDOM_FINANCE_URL as string | undefined) ?? 'http://localhost:3000'

/** Absolute URL of the Majordom chat route (`/chat`) in the Finance app. */
export const MAJORDOM_CHAT_URL = `${MAJORDOM_FINANCE_URL.replace(/\/+$/, '')}/chat`
