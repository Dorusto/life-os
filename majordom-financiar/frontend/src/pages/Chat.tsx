import { useState, useRef, useEffect, FormEvent } from 'react'
import { Send } from 'lucide-react'
import { sendChatMessageStreaming } from '../lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const starterSuggestions = [
  'How much did I spend this month?',
  'Am I on budget?',
  'What are my biggest expenses?',
]

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm Majordom, your financial assistant. Ask me anything about your spending, accounts, or savings goals." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e?: FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    // Build history from previous messages (including the welcome assistant message)
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    sendChatMessageStreaming(
      text,
      history,
      (chunk) => {
        setMessages(prev => {
          const newMessages = [...prev]
          // Check if an assistant message already exists
          const lastIndex = newMessages.length - 1
          if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
            // Update existing assistant message
            newMessages[lastIndex] = { ...newMessages[lastIndex], content: newMessages[lastIndex].content + chunk }
          } else {
            // Create new assistant message with the first chunk
            const newAssistantMessage: Message = { role: 'assistant', content: chunk }
            newMessages.push(newAssistantMessage)
          }
          return newMessages
        })
      },
      () => {
        setLoading(false)
      },
      (error) => {
        console.error('Chat error:', error)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${error}`
        }])
        setLoading(false)
      }
    )
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setInput(suggestion)
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
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[80%] px-4 py-3 text-sm leading-relaxed rounded-2xl
                ${msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-sm'
                  : 'bg-surface border border-border text-white rounded-bl-sm'
                }
              `}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading indicator (typing dots) - only shown when loading and no assistant message is already streaming */}
        {loading && (
          <div className="flex items-end gap-2">
            <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3">
              <TypingDots />
            </div>
          </div>
        )}

        {/* Starter suggestions (only shown when there are only welcome message) */}
        {messages.length === 1 && (
          <div className="space-y-2 mt-6">
            <p className="text-muted text-sm">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {starterSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="bg-surface hover:bg-surface-hover border border-border text-white text-sm px-4 py-2 rounded-xl transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar — fixed at bottom (above bottom nav, so pb-20) */}
      <form
        onSubmit={handleSend}
        className="sticky bottom-20 bg-background border-t border-border px-4 py-3 flex gap-3 items-end"
      >
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
          type="submit"
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
      </form>
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