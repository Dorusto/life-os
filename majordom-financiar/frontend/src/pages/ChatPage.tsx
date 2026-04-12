import { MessageCircle } from 'lucide-react'

/**
 * AI financial assistant chat page — placeholder until the backend is ready.
 * Will become a full conversational UI with access to real financial data.
 */
export default function ChatPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col pb-20">
      <header className="px-5 pt-14 pb-6">
        <p className="text-muted text-sm">Your financial advisor</p>
        <h1 className="text-white text-xl font-semibold mt-0.5">Majordom</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 gap-5 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center">
          <MessageCircle size={28} className="text-muted" />
        </div>
        <div>
          <p className="text-white font-medium">Chat assistant coming soon</p>
          <p className="text-muted text-sm mt-1 max-w-xs">
            Ask questions about your spending, set savings goals, and get personalized financial advice.
          </p>
        </div>
      </main>
    </div>
  )
}
