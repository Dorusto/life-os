import { useState, useRef, useEffect, FormEvent } from 'react'
import { Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { sendChatMessageStreaming } from '../lib/api'
import { getToken, clearAuth } from '../lib/auth'
import ProposalCard, { ProposalData } from '../components/ProposalCard'
import BudgetRebalanceCard from '../components/BudgetRebalanceCard'
import ClarificationCard from '../components/ClarificationCard'
import AccountTransferCard from '../components/AccountTransferCard'
import type { BudgetRebalanceData, ClarificationData, AccountTransferData } from '../lib/api'

export interface Message {
  role: 'user' | 'assistant' | 'status' | 'proposal' | 'budget_rebalance' | 'clarification' | 'account_transfer'
  content: string
  proposal?: ProposalData
  budgetRebalance?: BudgetRebalanceData
  clarification?: ClarificationData
  accountTransfer?: AccountTransferData
}

export const INITIAL_MESSAGES: Message[] = [
  { role: 'assistant', content: "Hello! I'm Majordom, your financial assistant. Ask me anything about your spending, accounts, or savings goals." }
]

const starterSuggestions = [
  'How much did I spend this month?',
  'Am I on budget?',
  'What are my biggest expenses?',
]

interface ChatProps {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
}

export default function Chat({ messages, setMessages }: ChatProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sentHistory, setSentHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [savedInput, setSavedInput] = useState('')
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [onboardingProgress, setOnboardingProgress] = useState<{ current: number; total: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Track if we're in the middle of an onboarding-start detection
  const onboardingStartedRef = useRef(false)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-focus input on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Check for active onboarding session on mount — verify with backend to avoid stale localStorage
  useEffect(() => {
    const active = localStorage.getItem('onboarding_active') === 'true'
    if (!active) return
    const token = getToken()
    fetch('/api/onboarding/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        if (data.active) {
          setIsOnboarding(true)
          const savedState = localStorage.getItem('onboarding_state')
          if (savedState) {
            try {
              const state = JSON.parse(savedState)
              if (state.current_question && state.total) {
                setOnboardingProgress({ current: state.current_question, total: state.total })
              }
            } catch {}
          }
        } else {
          // Stale localStorage — clear it
          localStorage.removeItem('onboarding_active')
          localStorage.removeItem('onboarding_state')
        }
      })
      .catch(() => {
        localStorage.removeItem('onboarding_active')
        localStorage.removeItem('onboarding_state')
      })
  }, [])

  // Send a specific text programmatically (used by ClarificationCard option clicks)
  function handleSendText(text: string) {
    if (!text || loading) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMessage])
    setLoading(true)

    if (isOnboarding || onboardingStartedRef.current) {
      // Send to onboarding endpoint
      sendOnboardingMessage(text)
    } else {
      // Exclude transaction exchanges from history — proposals are independent, previous amounts bleed into new calls.
      // Also exclude the user message that triggered a proposal/status (immediately followed by one).
      const PROPOSAL_ROLES = new Set(['proposal', 'budget_rebalance', 'account_transfer', 'clarification', 'status'])
      const history = messages
        .filter((m, i) => {
          if (PROPOSAL_ROLES.has(m.role)) return false
          if (m.role === 'user') {
            const next = messages[i + 1]
            if (next && PROPOSAL_ROLES.has(next.role)) return false
          }
          return m.role === 'user' || m.role === 'assistant'
        })
        .map(m => ({ role: m.role, content: m.content }))

      sendChatMessageStreaming(
        text,
        history,
        (chunk) => {
          handleChatChunk(chunk)
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
  }

  // Send a message to the onboarding endpoint
  async function sendOnboardingMessage(text: string) {
    const token = getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const res = await fetch('/api/onboarding/message', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: text }),
      })

      if (res.status === 401) {
        clearAuth()
        window.location.href = '/login'
        return
      }

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${errorBody.detail || 'Onboarding request failed'}`
        }])
        setLoading(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: No response body' }])
        setLoading(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete JSON lines from the buffer
        let newlineIdx
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim()
          buffer = buffer.slice(newlineIdx + 1)
          if (line) {
            handleOnboardingChunk(line)
          }
        }
      }

      // Process any remaining data
      if (buffer.trim()) {
        handleOnboardingChunk(buffer.trim())
      }

      setLoading(false)
    } catch (err) {
      console.error('Onboarding error:', err)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      }])
      setLoading(false)
    }
  }

  // Handle a chunk from the onboarding stream
  function handleOnboardingChunk(chunk: string) {
    const trimmed = chunk.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)

        if (parsed.type === 'onboarding_start') {
          // Begin onboarding mode
          onboardingStartedRef.current = true
          setIsOnboarding(true)
          localStorage.setItem('onboarding_active', 'true')
          return
        }

        if (parsed.type === 'onboarding_question') {
          setOnboardingProgress({ current: parsed.question_num, total: parsed.total })
          localStorage.setItem('onboarding_state', JSON.stringify({
            current_question: parsed.question_num,
            total: parsed.total,
          }))
          setMessages(prev => {
            const next = [...prev, { role: 'assistant' as const, content: parsed.text }]
            if (parsed.options?.length) {
              next.push({
                role: 'clarification' as const,
                content: '',
                clarification: { type: 'clarification' as const, question: '', options: parsed.options },
              })
            }
            return next
          })
          return
        }

        if (parsed.type === 'onboarding_complete') {
          // Onboarding done — clear state
          setIsOnboarding(false)
          onboardingStartedRef.current = false
          setOnboardingProgress(null)
          localStorage.removeItem('onboarding_active')
          localStorage.removeItem('onboarding_state')
          // Show the summary
          setMessages(prev => [...prev, { role: 'assistant', content: parsed.summary || 'Setup complete!' }])
          return
        }

        if (parsed.type === 'onboarding_cancelled') {
          // Onboarding cancelled
          setIsOnboarding(false)
          onboardingStartedRef.current = false
          setOnboardingProgress(null)
          localStorage.removeItem('onboarding_active')
          localStorage.removeItem('onboarding_state')
          setMessages(prev => [...prev, { role: 'assistant', content: parsed.message || 'Onboarding cancelled.' }])
          return
        }
      } catch {}
    }
  }

  // Handle a chunk from the normal chat stream
  function handleChatChunk(chunk: string) {
    const trimmed = chunk.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)

        // Check for onboarding_start in chat response
        if (parsed.type === 'onboarding_start') {
          onboardingStartedRef.current = true
          setIsOnboarding(true)
          localStorage.setItem('onboarding_active', 'true')
          // The next chunk should be the first question
          return
        }

        if (parsed.type === 'proposal') {
          setMessages(prev => [...prev, { role: 'proposal' as const, content: '', proposal: parsed as ProposalData }])
          return
        }
        if (parsed.type === 'budget_rebalance') {
          setMessages(prev => [...prev, { role: 'budget_rebalance' as const, content: '', budgetRebalance: parsed as BudgetRebalanceData }])
          return
        }
        if (parsed.type === 'clarification') {
          setMessages(prev => [...prev, { role: 'clarification' as const, content: '', clarification: parsed as ClarificationData }])
          return
        }
        if (parsed.type === 'account_transfer') {
          setMessages(prev => [...prev, { role: 'account_transfer' as const, content: '', accountTransfer: parsed as AccountTransferData }])
          return
        }

        if (parsed.type === 'onboarding_question') {
          setOnboardingProgress({ current: parsed.question_num, total: parsed.total })
          localStorage.setItem('onboarding_state', JSON.stringify({
            current_question: parsed.question_num,
            total: parsed.total,
          }))
          setMessages(prev => {
            const next = [...prev, { role: 'assistant' as const, content: parsed.text }]
            if (parsed.options?.length) {
              next.push({
                role: 'clarification' as const,
                content: '',
                clarification: { type: 'clarification' as const, question: '', options: parsed.options },
              })
            }
            return next
          })
          return
        }

        if (parsed.type === 'onboarding_complete') {
          setIsOnboarding(false)
          onboardingStartedRef.current = false
          setOnboardingProgress(null)
          localStorage.removeItem('onboarding_active')
          localStorage.removeItem('onboarding_state')
          setMessages(prev => [...prev, { role: 'assistant', content: parsed.summary || 'Setup complete!' }])
          return
        }

        if (parsed.type === 'onboarding_cancelled') {
          setIsOnboarding(false)
          onboardingStartedRef.current = false
          setOnboardingProgress(null)
          localStorage.removeItem('onboarding_active')
          localStorage.removeItem('onboarding_state')
          setMessages(prev => [...prev, { role: 'assistant', content: parsed.message || 'Onboarding cancelled.' }])
          return
        }
      } catch {
        // Chunk may contain multiple JSON objects separated by newlines
        if (trimmed.includes('\n')) {
          for (const line of trimmed.split('\n')) {
            if (line.trim()) handleChatChunk(line)
          }
          return
        }
      }
    }
    // Regular text chunk
    setMessages(prev => {
      const newMessages = [...prev]
      const lastIndex = newMessages.length - 1
      if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
        newMessages[lastIndex] = { ...newMessages[lastIndex], content: newMessages[lastIndex].content + chunk }
      } else {
        newMessages.push({ role: 'assistant', content: chunk })
      }
      return newMessages
    })
  }

  function handleSend(e?: FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (text) {
      setSentHistory(prev => [text, ...prev])
      setHistoryIndex(-1)
      setSavedInput('')
      setInput('')
      handleSendText(text)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
      return
    }
    if (e.key === 'ArrowUp' && sentHistory.length > 0) {
      const ta = e.currentTarget
      const cursorAtTop = ta.selectionStart === 0 || !input.includes('\n')
      if (cursorAtTop) {
        e.preventDefault()
        const newIndex = Math.min(historyIndex + 1, sentHistory.length - 1)
        if (historyIndex === -1) setSavedInput(input)
        setHistoryIndex(newIndex)
        setInput(sentHistory[newIndex])
      }
    }
    if (e.key === 'ArrowDown' && historyIndex > -1) {
      e.preventDefault()
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setInput(newIndex === -1 ? savedInput : sentHistory[newIndex])
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setInput(suggestion)
  }

  return (
    <div className="h-dvh pb-16 bg-background flex flex-col">
      {/* Header */}
      <header className="px-5 pt-14 pb-4 border-b border-border flex-shrink-0">
        <p className="text-muted text-sm">Your financial advisor</p>
        <h1 className="text-white text-xl font-semibold mt-0.5">Majordom</h1>
      </header>

      {/* Onboarding progress bar */}
      {isOnboarding && onboardingProgress && (
        <div className="px-5 py-2 bg-surface border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Setting up your budget — Question {onboardingProgress.current}/{onboardingProgress.total}</span>
          </div>
          <div className="mt-1 w-full bg-background rounded-full h-1.5">
            <div
              className="bg-accent h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(onboardingProgress.current / onboardingProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'status' ? (
              <p className="text-xs text-muted italic px-1">{msg.content}</p>
            ) : msg.role === 'budget_rebalance' && msg.budgetRebalance ? (
              <BudgetRebalanceCard
                data={msg.budgetRebalance}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'status' as const, content: message }
                        : m
                    )
                  )
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'status' as const, content: 'Cancelled.' }
                        : m
                    )
                  )
                }}
              />
            ) : msg.role === 'proposal' && msg.proposal ? (
              <ProposalCard
                proposal={msg.proposal}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'status' as const, content: message }
                        : m
                    )
                  )
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'status' as const, content: 'Cancelled.' }
                        : m
                    )
                  )
                }}
              />
            ) : msg.role === 'clarification' && msg.clarification ? (
              <ClarificationCard
                question={msg.clarification.question}
                options={msg.clarification.options}
                onSelected={(option) => {
                  // Replace the card with the chosen option as plain text (so it looks answered)
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'assistant', content: option }
                        : m
                    )
                  )
                  // Send the chosen option as a new user message
                  handleSendText(option)
                }}
              />
            ) : msg.role === 'account_transfer' && msg.accountTransfer ? (
              <AccountTransferCard
                data={msg.accountTransfer}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'status' as const, content: message }
                        : m
                    )
                  )
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx
                        ? { role: 'status' as const, content: 'Cancelled.' }
                        : m
                    )
                  )
                }}
              />
            ) : (
              <div
                className={`
                  max-w-[80%] px-4 py-3 text-sm leading-relaxed rounded-2xl
                  ${msg.role === 'user'
                    ? 'bg-accent text-white rounded-br-sm'
                    : 'bg-surface border border-border text-white rounded-bl-sm'
                  }
                `}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-p:my-0 prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            )}
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
        {messages.length === 1 && !isOnboarding && (
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

      {/* Input bar */}
      <form
        onSubmit={handleSend}
        className="flex-shrink-0 bg-background border-t border-border px-4 py-3 flex gap-3 items-end"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isOnboarding ? "Answer the question… (or type 'cancel' to exit)" : "Ask about your spending…"}
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
