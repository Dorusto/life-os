// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/shell/appLinks.ts.
// Run python3 scripts/sync_shared_frontend.py after editing the source, then commit both.

/**
 * Where each Majordom app lives. They are separate deployables on separate origins, so moving
 * between them is a real page load (an <a href>), never a router route. Set the VITE_* variables
 * outside the local stack; the fallbacks assume the default ports on the current host.
 */
export type AppId = 'finance' | 'transport' | 'invest'

export interface AppLink {
  label: string
  url: string
  accent: 'sage' | 'amber' | 'olive'
}

function resolve(configured: string | undefined, port: number): string {
  const value = configured && configured.trim()
    ? configured.trim()
    : `${window.location.protocol}//${window.location.hostname}:${port}`
  return value.replace(/\/+$/, '')
}

const env = import.meta.env as Record<string, string | undefined>

export const APP_LINKS: Record<AppId, AppLink> = {
  finance: { label: 'Finance', url: resolve(env.VITE_MAJORDOM_FINANCE_URL, 3000), accent: 'sage' },
  transport: { label: 'Transport', url: resolve(env.VITE_VEHICLE_APP_URL, 3010), accent: 'amber' },
  invest: { label: 'Invest', url: resolve(env.VITE_INVESTMENT_APP_URL, 3020), accent: 'olive' },
}
