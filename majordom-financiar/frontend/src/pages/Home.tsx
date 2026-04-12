import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Camera, Image, LogOut } from 'lucide-react'
import { getTransactions, getMonthlyStats } from '../lib/api'
import { getUsername, clearAuth } from '../lib/auth'
import TransactionItem from '../components/TransactionItem'
import SpendingChart from '../components/SpendingChart'

/**
 * Home screen — the main screen after login.
 *
 * Layout:
 *   - Top: greeting + logout
 *   - Center: two upload buttons (camera / gallery)
 *   - Bottom: last 5 transactions
 *
 * The two upload inputs (camera / gallery) are hidden <input> elements triggered
 * by button clicks. This is the standard PWA pattern for photo capture:
 *   - Camera button: capture="environment" → opens rear camera directly
 *   - Gallery button: no capture attr → opens photo library
 * Both require HTTPS in production (Tailscale or Coolify handle this).
 */
export default function Home() {
  const navigate = useNavigate()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => getTransactions(5),
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => getMonthlyStats(),
    // Stats are heavier to compute — refresh every 2 minutes, not on every focus
    staleTime: 120_000,
  })

  function handleFile(file: File) {
    // Store the selected file in sessionStorage as a data URL so ReceiptFlow
    // can access it without re-uploading. We use sessionStorage (not state)
    // because navigation clears component state.
    const reader = new FileReader()
    reader.onload = () => {
      sessionStorage.setItem('pendingReceiptDataUrl', reader.result as string)
      sessionStorage.setItem('pendingReceiptName', file.name)
      sessionStorage.setItem('pendingReceiptType', file.type)
      navigate('/receipt')
    }
    reader.readAsDataURL(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so selecting the same file again triggers onChange
    e.target.value = ''
  }

  function handleLogout() {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const username = getUsername()
  const greeting = getGreeting()

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-14 pb-2 flex-shrink-0">
        <div>
          <p className="text-muted text-sm">{greeting}</p>
          <h1 className="text-white text-xl font-semibold capitalize">{username}</h1>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 rounded-xl text-muted hover:text-white hover:bg-surface transition-colors"
          aria-label="Log out"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Upload buttons */}
      <section className="flex flex-col items-center px-5 pt-8 pb-6 gap-4">
        <p className="text-muted text-sm tracking-wide uppercase text-xs">Add receipt</p>

        {/* Camera button — opens rear camera directly */}
        <div className="w-full max-w-xs flex flex-col gap-3">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="
              w-full py-5 rounded-2xl bg-accent hover:bg-accent-hover active:scale-[0.97]
              flex items-center justify-center gap-3
              text-white font-medium text-base
              transition-all duration-150 shadow-lg shadow-accent/20
            "
          >
            <Camera size={22} />
            Take Photo
          </button>

          {/* Gallery button — opens photo library */}
          <button
            onClick={() => galleryInputRef.current?.click()}
            className="
              w-full py-4 rounded-2xl bg-surface hover:bg-surface-2 active:scale-[0.97]
              border border-border hover:border-border-hover
              flex items-center justify-center gap-3
              text-white font-medium text-base
              transition-all duration-150
            "
          >
            <Image size={20} />
            Choose from Gallery
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInputChange}
          className="hidden"
          aria-hidden="true"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
          aria-hidden="true"
        />
      </section>

      {/* Monthly spending chart */}
      {stats && (
        <section className="px-5 pb-4">
          <SpendingChart stats={stats} />
        </section>
      )}

      {/* Recent transactions */}
      <section className="px-5 pb-10">
        <h2 className="text-muted text-xs uppercase tracking-wide mb-3">Recent</h2>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && transactions && transactions.length === 0 && (
          <p className="text-muted text-sm text-center py-6">
            No transactions yet. Add your first receipt above.
          </p>
        )}

        {!isLoading && transactions && transactions.length > 0 && (
          <div className="space-y-2">
            {transactions.map(tx => (
              <TransactionItem key={tx.id} transaction={tx} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning,'
  if (hour < 18) return 'Good afternoon,'
  return 'Good evening,'
}
