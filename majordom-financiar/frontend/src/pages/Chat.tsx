import { useState, useRef, useEffect, FormEvent } from 'react'
import { Send, Plus, Camera, Image, FileText, HelpCircle, X, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { sendChatMessageStreaming, getSetupStatus, previewCsvImport, importFuelio, uploadReceipt, saveChatHistory, clearChatHistory, type SetupAccount, type BalanceAdjustmentData, type ImportPreview, type ReceiptDraft, type CategoryActionData, type FuelConfirmResponse, type VehicleLogActionData, type VehicleReminderData } from '../lib/api'
import CsvImportCard from '../components/CsvImportCard'
import FuelioImportCard, { FuelioImportData } from '../components/FuelioImportCard'
import ProposalCard, { ProposalData } from '../components/ProposalCard'
import BudgetRebalanceCard from '../components/BudgetRebalanceCard'
import ClarificationCard from '../components/ClarificationCard'
import AccountTransferCard from '../components/AccountTransferCard'
import SetupBalancesCard from '../components/SetupBalancesCard'
import BalanceAdjustmentCard from '../components/BalanceAdjustmentCard'
import IncomeSourceCard from '../components/IncomeSourceCard'
import ReconciliationCard from '../components/ReconciliationCard'
import ReceiptCard from '../components/ReceiptCard'
import FuelReceiptCard from '../components/FuelReceiptCard'
import CategoryActionCard from '../components/CategoryActionCard'
import GoalProposalCard, { GoalProposalData } from '../components/GoalProposalCard'
import VehicleLogActionCard from '../components/VehicleLogActionCard'
import VehicleReminderCard from '../components/VehicleReminderCard'
import type { BudgetRebalanceData, ClarificationData, AccountTransferData } from '../lib/api'


export interface Message {
  role: 'user' | 'assistant' | 'status' | 'proposal' | 'budget_rebalance' | 'clarification' | 'account_transfer' | 'setup_balances' | 'balance_adjustment' | 'csv_import' | 'fuelio_import' | 'income_source' | 'reconciliation' | 'receipt' | 'category_action' | 'goal_proposal' | 'fuel_log' | 'vehicle_log_action' | 'vehicle_reminder'
  content: string
  proposal?: ProposalData
  budgetRebalance?: BudgetRebalanceData
  clarification?: ClarificationData
  accountTransfer?: AccountTransferData
  balanceAdjustment?: BalanceAdjustmentData
  setupAccounts?: SetupAccount[]
  csvImport?: { status: 'loading' | 'ready' | 'error'; preview?: ImportPreview; error?: string }
  fuelioImport?: FuelioImportData
  incomeRow?: { payee: string; amount: number; date: string }
  reconciliation?: { accountName: string; balance: number; importedCount: number }
  receipt?: {
    status: 'loading' | 'reviewing' | 'error'
    imageUrl?: string
    draft?: ReceiptDraft
    error?: string
    activeTab?: 'fuel' | 'grocery'
    fuelStats?: FuelConfirmResponse
  }
  categoryAction?: CategoryActionData
  goalProposal?: GoalProposalData
  fuelLog?: { draft: ReceiptDraft; fuelStats?: FuelConfirmResponse }
  vehicleLogAction?: VehicleLogActionData
  vehicleReminder?: VehicleReminderData
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
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaMenuRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-focus input on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Close media menu on outside click
  useEffect(() => {
    if (!showMediaMenu) return
    function close(e: MouseEvent) {
      if (mediaMenuRef.current && !mediaMenuRef.current.contains(e.target as Node)) {
        setShowMediaMenu(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showMediaMenu])

  // Check first-launch setup — if not complete, show welcome + balance entry card directly
  useEffect(() => {
    getSetupStatus().then(status => {
      if (!status.completed) {
        setMessages([
          {
            role: 'assistant',
            content: "Welcome to Majordom! Before we start, enter your real account balances so your budget is accurate from day one.",
          },
          {
            role: 'setup_balances',
            content: '',
            setupAccounts: status.accounts,
          },
        ])
      }
    }).catch(() => {})
  }, [])

  function handleReceiptFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const imageUrl = reader.result as string

      // Add loading placeholder to chat
      setMessages(prev => [...prev, {
        role: 'receipt' as const,
        content: '',
        receipt: { status: 'loading' as const, imageUrl },
      }])

      uploadReceipt(file)
        .then(draft => {
          setMessages(prev => {
            const idx = [...prev].reverse().findIndex(m => m.role === 'receipt' && m.receipt?.status === 'loading')
            if (idx === -1) return prev
            const realIdx = prev.length - 1 - idx
            const updated = [...prev]
            updated[realIdx] = { ...updated[realIdx], receipt: { status: 'reviewing', imageUrl, draft } }
            return updated
          })
        })
        .catch(err => {
          setMessages(prev => {
            const idx = [...prev].reverse().findIndex(m => m.role === 'receipt' && m.receipt?.status === 'loading')
            if (idx === -1) return prev
            const realIdx = prev.length - 1 - idx
            const updated = [...prev]
            updated[realIdx] = { ...updated[realIdx], receipt: { status: 'error', imageUrl, error: err.message || 'Failed to read receipt' } }
            return updated
          })
        })
    }
    reader.readAsDataURL(file)
  }

  async function isFuelioFile(file: File): Promise<boolean> {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = e => {
        const text = (e.target?.result as string) || ''
        resolve(text.trimStart().startsWith('"## Vehicle"'))
      }
      reader.readAsText(file.slice(0, 50))
    })
  }

  async function handleFuelioSelected(file: File) {
    setMessages(prev => [...prev, {
      role: 'fuelio_import' as const,
      content: '',
      fuelioImport: { status: 'loading' },
    }])
    try {
      const result = await importFuelio(file)
      setMessages(prev => {
        const idx = [...prev].reverse().findIndex(m => m.role === 'fuelio_import' && m.fuelioImport?.status === 'loading')
        if (idx === -1) return prev
        const realIdx = prev.length - 1 - idx
        const updated = [...prev]
        updated[realIdx] = { role: 'fuelio_import' as const, content: '', fuelioImport: { status: 'done', result } }
        return updated
      })
    } catch (err) {
      setMessages(prev => {
        const idx = [...prev].reverse().findIndex(m => m.role === 'fuelio_import' && m.fuelioImport?.status === 'loading')
        if (idx === -1) return prev
        const realIdx = prev.length - 1 - idx
        const updated = [...prev]
        updated[realIdx] = { role: 'fuelio_import' as const, content: '', fuelioImport: { status: 'error', error: err instanceof Error ? err.message : 'Import failed' } }
        return updated
      })
    }
  }

  async function handleCsvSelected(file: File) {
    // Detect Fuelio files before calling the CSV endpoint
    if (await isFuelioFile(file)) {
      handleFuelioSelected(file)
      return
    }

    // Append a loading placeholder to chat
    setMessages(prev => [...prev, {
      role: 'csv_import' as const,
      content: '',
      csvImport: { status: 'loading' },
    }])

    try {
      const preview = await previewCsvImport(file)
      // Replace loading placeholder with real preview data
      setMessages(prev => {
        const idx = [...prev].reverse().findIndex(m => m.role === 'csv_import')
        if (idx === -1) return prev
        const realIdx = prev.length - 1 - idx
        const updated = [...prev]
        updated[realIdx] = {
          role: 'csv_import' as const,
          content: '',
          csvImport: { status: 'ready', preview },
        }
        return updated
      })
    } catch (err) {
      setMessages(prev => {
        const idx = [...prev].reverse().findIndex(m => m.role === 'csv_import')
        if (idx === -1) return prev
        const realIdx = prev.length - 1 - idx
        const updated = [...prev]
        updated[realIdx] = {
          role: 'csv_import' as const,
          content: '',
          csvImport: { status: 'error', error: err instanceof Error ? err.message : 'Failed to parse CSV' },
        }
        return updated
      })
    }
  }

  // Send a specific text programmatically (used by ClarificationCard option clicks)
  function handleSendText(text: string) {
    if (!text || loading) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMessage])
    setLoading(true)

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
        // Save complete exchange to server history
        setMessages(prev => {
          const msgs = prev.filter(m => m.role === 'user' || m.role === 'assistant')
          // Extract user message and last assistant reply from the exchange
          const lastUser = msgs.filter(m => m.role === 'user').slice(-1)[0]
          const lastAssistant = msgs.filter(m => m.role === 'assistant').slice(-1)[0]
          if (lastUser && lastAssistant) {
            saveChatHistory([
              { role: 'user', content: lastUser.content },
              { role: 'assistant', content: lastAssistant.content },
            ])
          }
          return prev
        })
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

  // Handle a chunk from the chat stream
  function handleChatChunk(chunk: string) {
    const trimmed = chunk.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)

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
        if (parsed.type === 'balance_adjustment') {
          setMessages(prev => [...prev, { role: 'balance_adjustment' as const, content: '', balanceAdjustment: parsed as BalanceAdjustmentData }])
          return
        }
        if (parsed.type === 'category_action') {
          setMessages(prev => [...prev, { role: 'category_action' as const, content: '', categoryAction: parsed as CategoryActionData }])
          return
        }
        if (parsed.type === 'goal_proposal') {
          setMessages(prev => [...prev, { role: 'goal_proposal' as const, content: '', goalProposal: parsed as GoalProposalData }])
          return
        }
        if (parsed.type === 'fuel_log') {
          setMessages(prev => [...prev, { role: 'fuel_log' as const, content: '', fuelLog: { draft: parsed as unknown as ReceiptDraft } }])
          return
        }
        if (parsed.type === 'vehicle_log_action') {
          setMessages(prev => [...prev, { role: 'vehicle_log_action' as const, content: '', vehicleLogAction: parsed as VehicleLogActionData }])
          return
        }
        if (parsed.type === 'vehicle_reminder') {
          setMessages(prev => [...prev, { role: 'vehicle_reminder' as const, content: '', vehicleReminder: parsed as VehicleReminderData }])
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

  async function handleClearHistory() {
    if (!window.confirm('Clear all chat history?')) return
    await clearChatHistory()
    setMessages(INITIAL_MESSAGES)
  }

  return (
    <div className="h-dvh pb-16 bg-background flex flex-col">
      {/* Header */}
      <header className="px-5 pt-[56px] pb-4 border-b border-border flex-shrink-0 flex items-end justify-between">
        <div>
          <p className="text-xs tracking-widest uppercase text-muted">Your financial advisor</p>
          <h1 className="font-display text-3xl font-bold text-white mt-0.5">Majordom</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            className="mb-0.5 text-muted hover:text-red-400 transition-colors"
            title="Clear chat history"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="mb-0.5 text-muted hover:text-white transition-colors"
            title="How to use Majordom"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </header>

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowHelp(false)}>
          <div
            className="w-full bg-surface border-t border-border rounded-t-2xl px-6 pt-5 pb-24 space-y-5 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold text-base">How to use Majordom</h2>
              <button onClick={() => setShowHelp(false)} className="text-muted hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-white font-medium mb-1">What is Majordom?</p>
                <p className="text-muted leading-relaxed">Majordom is your personal finance assistant. Talk to it naturally — it understands your budget, accounts, and spending history.</p>
              </div>

              <div>
                <p className="text-white font-medium mb-2">What you can ask</p>
                <ul className="space-y-1.5 text-muted">
                  <li className="flex gap-2"><span className="text-accent">→</span> "How much did I spend on groceries this month?"</li>
                  <li className="flex gap-2"><span className="text-accent">→</span> "Am I over budget on restaurants?"</li>
                  <li className="flex gap-2"><span className="text-accent">→</span> "Transfer €200 from ING to savings"</li>
                  <li className="flex gap-2"><span className="text-accent">→</span> "Add a transaction — coffee at Starbucks, €4.50"</li>
                  <li className="flex gap-2"><span className="text-accent">→</span> "What's my current balance?"</li>
                </ul>
              </div>

              <div>
                <p className="text-white font-medium mb-2">Import bank transactions</p>
                <p className="text-muted leading-relaxed">Tap <span className="text-white font-medium">+</span> in the input bar to:</p>
                <ul className="space-y-1 text-muted mt-1">
                  <li className="flex gap-2"><span className="text-accent">→</span> Take a photo of a receipt</li>
                  <li className="flex gap-2"><span className="text-accent">→</span> Upload a CSV export from your bank</li>
                </ul>
              </div>

              <div>
                <p className="text-white font-medium mb-2">Tips</p>
                <ul className="space-y-1.5 text-muted">
                  <li className="flex gap-2"><span className="text-accent">→</span> Majordom learns your merchants — categories improve over time</li>
                  <li className="flex gap-2"><span className="text-accent">→</span> Always review transactions marked with <span className="text-yellow-500 font-medium">?</span> before importing</li>
                  <li className="flex gap-2"><span className="text-accent">→</span> Income and transfers need to be named once — Majordom remembers them</li>
                </ul>
              </div>
            </div>
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
                  // Replace the card with the chosen option as plain text
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'assistant' as const, content: option } : m
                    )
                  )
                  handleSendText(option)
                }}
              />
            ) : msg.role === 'setup_balances' ? (
              <SetupBalancesCard
                accounts={msg.setupAccounts || []}
                onComplete={(message) => {
                  setMessages(prev => [
                    ...prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: message } : m
                    ),
                    {
                      role: 'assistant' as const,
                      content: "You're all set! To keep your budget accurate, add transactions as you go — upload your bank's CSV or just tell me about expenses: *\"spent €45 at Lidl\"* and I'll record them. Try to do this at least once a week.",
                    },
                  ])
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
            ) : msg.role === 'balance_adjustment' && msg.balanceAdjustment ? (
              <BalanceAdjustmentCard
                data={msg.balanceAdjustment}
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
            ) : msg.role === 'category_action' && msg.categoryAction ? (
              <CategoryActionCard
                data={msg.categoryAction}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: message } : m
                    )
                  )
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: 'Cancelled.' } : m
                    )
                  )
                }}
              />
            ) : msg.role === 'goal_proposal' && msg.goalProposal ? (
              <GoalProposalCard
                data={msg.goalProposal}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: message } : m
                    )
                  )
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: 'Cancelled.' } : m
                    )
                  )
                }}
              />
            ) : msg.role === 'vehicle_log_action' && msg.vehicleLogAction ? (
              <VehicleLogActionCard
                data={msg.vehicleLogAction}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: message } : m
                    )
                  )
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: 'Cancelled.' } : m
                    )
                  )
                }}
              />
            ) : msg.role === 'vehicle_reminder' && msg.vehicleReminder ? (
              <VehicleReminderCard
                data={msg.vehicleReminder}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: message } : m
                    )
                  )
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: 'Cancelled.' } : m
                    )
                  )
                }}
              />
            ) : msg.role === 'fuelio_import' && msg.fuelioImport ? (
              <FuelioImportCard data={msg.fuelioImport} />
            ) : msg.role === 'csv_import' && msg.csvImport ? (
              <CsvImportCard
                data={msg.csvImport}
                onConfirmed={(message, result) => {
                  // Replace the csv_import card with a status message
                  const newMessages: Message[] = [
                    { role: 'status' as const, content: message },
                  ]
                  // Append income_source cards for each unknown income row
                  if (result?.unknown_income_rows?.length) {
                    for (const row of result.unknown_income_rows) {
                      newMessages.push({
                        role: 'income_source' as const,
                        content: '',
                        incomeRow: row,
                      })
                    }
                  }
                  // Append reconciliation card if backend returned account balance
                  if (result?.account_balance !== undefined && result.account_name) {
                    newMessages.push({
                      role: 'reconciliation' as const,
                      content: '',
                      reconciliation: {
                        accountName: result.account_name,
                        balance: result.account_balance,
                        importedCount: result.imported,
                      },
                    })
                  }
                  setMessages(prev => {
                    const updated = prev.map((m, i) =>
                      i === idx ? newMessages[0] : m
                    )
                    // Append remaining new messages after the replaced one
                    for (let j = 1; j < newMessages.length; j++) {
                      updated.push(newMessages[j])
                    }
                    return updated
                  })
                }}
                onCancelled={() => {
                  setMessages(prev =>
                    prev.map((m, i) => i === idx ? { role: 'status' as const, content: 'Import cancelled.' } : m)
                  )
                }}
              />
            ) : msg.role === 'income_source' && msg.incomeRow ? (
              <IncomeSourceCard
                payee={msg.incomeRow.payee}
                amount={msg.incomeRow.amount}
                date={msg.incomeRow.date}
                onConfirmed={(message) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: message } : m
                    )
                  )
                }}
              />
            ) : msg.role === 'receipt' && msg.receipt ? (
              // Show fuel stats after confirmation
              msg.receipt.status === 'reviewing' && msg.receipt.fuelStats ? (
                <PendingFuelStatsDisplay msg={msg.receipt} />
              ) : msg.receipt.status === 'reviewing' && msg.receipt.draft?.receipt_type === 'fuel' && msg.receipt.activeTab !== 'grocery' ? (
                <FuelReceiptCard
                  draft={msg.receipt.draft}
                  imageUrl={msg.receipt.imageUrl}
                  onConfirmed={(stats) => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx
                          ? {
                              ...m,
                              receipt: {
                                ...m.receipt!,
                                fuelStats: stats,
                              },
                            }
                          : m
                      )
                    )
                  }}
                  onCancelled={() => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx ? { role: 'status' as const, content: 'Receipt cancelled.' } : m
                      )
                    )
                  }}
                  onSwitchToGrocery={() => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx
                          ? { ...m, receipt: { ...m.receipt!, activeTab: 'grocery' } }
                          : m
                      )
                    )
                  }}
                />
              ) : (
                <ReceiptCard
                  imageUrl={msg.receipt.imageUrl}
                  status={msg.receipt.status}
                  draft={msg.receipt.draft}
                  error={msg.receipt.error}
                  onSwitchToFuel={() => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx
                          ? { ...m, receipt: { ...m.receipt!, activeTab: 'fuel' } }
                          : m
                      )
                    )
                  }}
                  onConfirmed={(message) => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx ? { role: 'status' as const, content: message } : m
                      )
                    )
                  }}
                  onCancelled={() => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx ? { role: 'status' as const, content: 'Receipt cancelled.' } : m
                      )
                    )
                  }}
                />
              )
            ) : msg.role === 'fuel_log' && msg.fuelLog ? (
              // Show fuel stats after confirmation
              msg.fuelLog.fuelStats ? (
                <PendingFuelStatsDisplay draft={msg.fuelLog.draft} stats={msg.fuelLog.fuelStats} />
              ) : (
                <FuelReceiptCard
                  draft={msg.fuelLog.draft}
                  confirmEndpoint={`/vehicle/proposals/${msg.fuelLog.draft.receipt_id}/confirm`}
                  onConfirmed={(stats) => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx
                          ? {
                              ...m,
                              fuelLog: {
                                ...m.fuelLog!,
                                fuelStats: stats,
                              },
                            }
                          : m
                      )
                    )
                  }}
                  onCancelled={() => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx ? { role: 'status' as const, content: 'Cancelled.' } : m
                      )
                    )
                  }}
                  onSwitchToGrocery={() => {
                    setMessages(prev =>
                      prev.map((m, i) =>
                        i === idx
                          ? { role: 'receipt' as const, content: '', receipt: { status: 'reviewing' as const, draft: m.fuelLog!.draft, activeTab: 'grocery' as const } }
                          : m
                      )
                    )
                  }}
                />
              )
            ) : msg.role === 'reconciliation' && msg.reconciliation ? (
              <ReconciliationCard
                accountName={msg.reconciliation.accountName}
                balance={msg.reconciliation.balance}
                importedCount={msg.reconciliation.importedCount}
                onDismiss={() => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: 'Balance confirmed.' } : m
                    )
                  )
                }}
                onAdjust={(realBalance) => {
                  setMessages(prev =>
                    prev.map((m, i) =>
                      i === idx ? { role: 'status' as const, content: 'Checking balance...' } : m
                    )
                  )
                  handleSendText(`Balance for ${msg.reconciliation!.accountName} should be €${realBalance.toFixed(2)}`)
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

      {/* Input bar */}
      <form
        onSubmit={handleSend}
        className="flex-shrink-0 bg-background border-t border-border px-4 py-3 flex gap-2 items-end"
      >
        {/* + media button */}
        <div className="relative flex-shrink-0" ref={mediaMenuRef}>
          <button
            type="button"
            onClick={() => setShowMediaMenu(v => !v)}
            className={`
              w-10 h-10 rounded-xl border flex items-center justify-center transition-all
              ${showMediaMenu
                ? 'bg-accent border-accent text-white'
                : 'bg-surface border-border text-muted hover:border-accent hover:text-white'}
            `}
            aria-label="Add media"
          >
            <Plus size={18} />
          </button>

          {showMediaMenu && (
            <div className="absolute bottom-12 left-0 w-[208px] bg-surface border border-border rounded-2xl shadow-xl overflow-hidden z-50">
              {([
                { icon: Camera,   label: 'Take photo',          action: () => cameraInputRef.current?.click() },
                { icon: Image,    label: 'Choose from gallery',  action: () => galleryInputRef.current?.click() },
                { icon: FileText, label: 'Upload CSV',           action: () => csvInputRef.current?.click() },
              ] as const).map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { action(); setShowMediaMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-hover transition-colors text-left"
                >
                  <Icon size={16} className="text-muted flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
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

      {/* Hidden file inputs */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (!f) return
          e.target.value = ''
          setShowMediaMenu(false)
          handleCsvSelected(f)
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (!f) return
          e.target.value = ''
          handleReceiptFile(f)
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (!f) return
          e.target.value = ''
          handleReceiptFile(f)
        }}
      />
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

/** Post-confirm fuel stats displayed as grey text after the card is confirmed. */
function PendingFuelStatsDisplay({ msg, draft: propDraft, stats: propStats }: {
  msg?: NonNullable<Message['receipt']>
  draft?: ReceiptDraft
  stats?: FuelConfirmResponse
}) {
  // Support both: receipt mode (msg with embedded fuelStats) and fuel_log mode (draft + stats)
  const resolvedStats = propStats ?? msg?.fuelStats ?? null
  const resolvedDraft = propDraft ?? msg?.draft ?? null
  if (!resolvedStats) return null

  const vehicleName = resolvedDraft?.vehicles?.find(v => v.id === resolvedDraft?.suggested_vehicle_id)?.name ?? 'Vehicle'
  const name = resolvedStats.vehicle_name ?? vehicleName

  return (
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm max-w-[420px] w-full px-4 py-3 space-y-1">
      {resolvedStats.success ? (
        <>
          <p className="text-sm text-white font-medium">✅ Refuel logged — {name}</p>
          {resolvedStats.liters != null && (
            <p className="text-xs text-muted">
              {resolvedStats.liters}L
              {resolvedStats.price_per_liter != null && ` → €${resolvedStats.price_per_liter.toFixed(3)}/L`}
              {resolvedStats.fuel_grade && ` (${resolvedStats.fuel_grade})`}
            </p>
          )}
          {(resolvedStats.km_since_last != null || resolvedStats.consumption_l100km != null || resolvedStats.cost_per_km != null) && (
            <p className="text-xs text-muted">
              {resolvedStats.km_since_last != null && `+${Math.round(resolvedStats.km_since_last).toLocaleString()} km`}
              {resolvedStats.consumption_l100km != null && `  |  ${resolvedStats.consumption_l100km.toFixed(1)} L/100km`}
              {resolvedStats.cost_per_km != null && `  |  €${resolvedStats.cost_per_km.toFixed(3)}/km`}
            </p>
          )}
          {resolvedDraft?.merchant && <p className="text-xs text-muted">{resolvedDraft.merchant}</p>}
        </>
      ) : (
        <p className="text-xs text-red-400">❌ Failed to save fuel receipt.</p>
      )}
    </div>
  )
}
