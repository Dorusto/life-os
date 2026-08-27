import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { LogOut, RefreshCw, Wallet, Database, Car, ChevronRight } from 'lucide-react'
import { syncAccounts } from '../lib/api'
import { clearAuth } from '../lib/auth'
import PageHeader from '../components/PageHeader'

/**
 * Interim Settings page (#193 owns the real Personal/Workspace/Connections/
 * Notifications/About structure). For now this just carries over what used
 * to live in the old Home.tsx kebab menu — sync, external service links,
 * logout — so the header's gear icon has somewhere real to point without
 * losing existing functionality in the meantime.
 */
export default function Settings() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'failed'>('idle')

  async function handleSync() {
    setSyncState('syncing')
    try {
      await syncAccounts()
      await queryClient.invalidateQueries({ queryKey: ['home'] })
      await queryClient.invalidateQueries({ queryKey: ['account-list'] })
      setSyncState('idle')
    } catch {
      setSyncState('failed')
    }
  }

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const origin = `${window.location.protocol}//${window.location.hostname}`
  // Public Actual Budget URL — set VITE_ACTUAL_BUDGET_URL at build time for a
  // custom domain; otherwise falls back to this host on AB's default port.
  const actualBudgetUrl = import.meta.env.VITE_ACTUAL_BUDGET_URL || `${origin}:5006`

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader label="Full settings screen — #193" title="Settings" />
      <section className="px-5 pt-2 pb-24 space-y-2.5">
        <button
          onClick={handleSync}
          disabled={syncState === 'syncing'}
          className="w-full flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3.5 disabled:opacity-60 hover:border-border-hover transition-colors"
        >
          <RefreshCw size={16} className={`text-muted flex-shrink-0 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
          <span className="flex-1 text-left text-sm font-semibold text-white">
            {syncState === 'failed' ? 'Sync failed — tap to retry' : 'Sync accounts'}
          </span>
        </button>

        <a
          href={actualBudgetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3.5 hover:border-border-hover transition-colors"
        >
          <Wallet size={16} className="text-muted flex-shrink-0" />
          <span className="flex-1 text-sm font-semibold text-white">Actual Budget</span>
          <ChevronRight size={14} className="text-muted flex-shrink-0" />
        </a>
        <a
          href={`${origin}:8888`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3.5 hover:border-border-hover transition-colors"
        >
          <Database size={16} className="text-muted flex-shrink-0" />
          <span className="flex-1 text-sm font-semibold text-white">Majordom Memory</span>
          <ChevronRight size={14} className="text-muted flex-shrink-0" />
        </a>
        <a
          href={`${origin}:8889`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3.5 hover:border-border-hover transition-colors"
        >
          <Car size={16} className="text-muted flex-shrink-0" />
          <span className="flex-1 text-sm font-semibold text-white">Vehicle Manager</span>
          <ChevronRight size={14} className="text-muted flex-shrink-0" />
        </a>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3.5 mt-4 hover:border-danger/50 transition-colors"
        >
          <LogOut size={16} className="text-danger flex-shrink-0" />
          <span className="flex-1 text-left text-sm font-semibold text-danger">Log out</span>
        </button>
      </section>
    </div>
  )
}
