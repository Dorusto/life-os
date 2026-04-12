import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { sendChatMessage } from '../lib/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hello! I'm Majordom, your financial assistant. Ask me anything about your spending, accounts, or savings goals.",
  timestamp: new Date(),
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to latest message whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Build history from current messages (exclude the welcome message role-wise)
    const history = messages
      .filter(m => m.id !== 'welcome')
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const { reply } = await sendChatMessage(text, history)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I could not reach the assistant right now. Please try again.',
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="px-5 pt-14 pb-4 border-b border-border flex-shrink-0">
        <p className="text-muted text-sm">Your financial advisor</p>
        <h1 className="text-white text-xl font-semibold mt-0.5">Majordom</h1>
      </header>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-2">
        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-end gap-2">
            <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar — sits above bottom nav (bottom-16) */}
      <div className="sticky bottom-16 bg-background border-t border-border px-4 py-3 flex gap-3 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your spending…"
          rows={1}
          className="
            flex-1 bg-surface border border-border rounded-xl px-4 py-3
            text-white text-sm placeholder:text-muted
            focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
            resize-none transition-colors
          "
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="
            w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover
            flex items-center justify-center flex-shrink-0
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-95 transition-all duration-150
          "
          aria-label="Send"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[80%] px-4 py-3 text-sm leading-relaxed
          ${isUser
            ? 'bg-accent text-white rounded-2xl rounded-br-sm'
            : 'bg-surface border border-border text-white rounded-2xl rounded-bl-sm'
          }
        `}
      >
        {message.content}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-4">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}
