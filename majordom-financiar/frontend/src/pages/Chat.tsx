import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Send, Plus, Camera, Image, FileText, HelpCircle, Trash2, MoreVertical } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { sendChatMessageStreaming, getSetupStatus, previewCsvImport, importFuelio, saveChatHistory, clearChatHistory, proposeSavingsBudget, type SetupAccount, type BalanceAdjustmentData, type CloseAccountData, type ImportPreview, type ReceiptDraft, type CategoryActionData, type CategoryOverviewData, type BudgetOverviewData, type FuelConfirmResponse, type VehicleLogActionData, type VehicleReminderData, type VehicleStatusData, type TransferConversionData, type NotificationTimeData } from '../lib/api'
import CsvImportCard from '../components/CsvImportCard'
import FuelioImportCard, { FuelioImportData } from '../components/FuelioImportCard'
import ProposalCard, { ProposalData } from '../components/ProposalCard'
import BudgetRebalanceCard from '../components/BudgetRebalanceCard'
import ClarificationCard from '../components/ClarificationCard'
import AccountTransferCard from '../components/AccountTransferCard'
import SetupBalancesCard from '../components/SetupBalancesCard'
import BalanceAdjustmentCard from '../components/BalanceAdjustmentCard'
import CloseAccountCard from '../components/CloseAccountCard'
import TransferConversionCard from '../components/TransferConversionCard'
import IncomeSourceCard from '../components/IncomeSourceCard'
import FuelReceiptCard from '../components/FuelReceiptCard'
import ReceiptFlow, { type ReceiptSaved } from './ReceiptFlow'
import CategoryActionCard from '../components/CategoryActionCard'
import CategoryOverviewCard from '../components/CategoryOverviewCard'
import BudgetOverviewCard from '../components/BudgetOverviewCard'
import BudgetCopyCard from '../components/BudgetCopyCard'
import ReachedGoalsCard from '../components/ReachedGoalsCard'
import GoalProposalCard, { GoalProposalData } from '../components/GoalProposalCard'
import VehicleLogActionCard from '../components/VehicleLogActionCard'
import VehicleReminderCard from '../components/VehicleReminderCard'
import VehicleStatusCard from '../components/VehicleStatusCard'
import NotificationTimeCard from '../components/NotificationTimeCard'
import Chart from '../components/Chart'
import TransactionListCard, { TransactionListData } from '../components/TransactionListCard'
import { PageHeader } from '../components/shell/PageHeader'
import IconButton from '../components/IconButton'
import BottomSheet from '../components/BottomSheet'
import StandardHeaderActions from '../components/StandardHeaderActions'
import type { BudgetRebalanceData, ClarificationData, AccountTransferData } from '../lib/api'
import { formatCurrency, formatNumber } from '../lib/formatCurrency'


export interface Message {
  role: 'user' | 'assistant' | 'status' | 'proposal' | 'budget_rebalance' | 'clarification' | 'account_transfer' | 'setup_balances' | 'balance_adjustment' | 'close_account' | 'csv_import' | 'fuelio_import' | 'income_source' | 'category_action' | 'category_overview' | 'budget_overview' | 'goal_proposal' | 'fuel_log' | 'vehicle_log_action' | 'vehicle_reminder' | 'vehicle_status' | 'transfer_conversion' | 'chart' | 'notification_time' | 'transaction_list'

  content: string
  ts?: number
  /** True for messages loaded from server history — skip re-persisting them. */
  _synced?: boolean
  /** Set on a card chained after another card's status (e.g. savings-goal → budget top-up, #76) —
   *  its resolution is persisted directly (with this text) instead of re-anchoring to the original
   *  user message, which would otherwise duplicate it in server history (see architecture.md rule 17). */
  chainedOfferText?: string
  chart?: { chart_type: 'pie' | 'bar' | 'line' | 'progress_list'; title: string; data: any }
  transactionList?: { title: string; data: TransactionListData }
  proposal?: ProposalData
  budgetRebalance?: BudgetRebalanceData
  clarification?: ClarificationData
  accountTransfer?: AccountTransferData
  balanceAdjustment?: BalanceAdjustmentData
  closeAccount?: CloseAccountData
  setupAccounts?: SetupAccount[]
  csvImport?: { status: 'loading' | 'ready' | 'error'; preview?: ImportPreview; error?: string }
  fuelioImport?: FuelioImportData
  incomeRow?: { payee: string; amount: number; date: string }
  categoryAction?: CategoryActionData
  categoryOverview?: CategoryOverviewData
  budgetOverview?: BudgetOverviewData
  goalProposal?: GoalProposalData
  fuelLog?: { draft: ReceiptDraft; fuelStats?: FuelConfirmResponse }
  vehicleLogAction?: VehicleLogActionData
  vehicleReminder?: VehicleReminderData
  vehicleStatus?: VehicleStatusData
  transferConversion?: TransferConversionData
  notificationTime?: NotificationTimeData
}



export const INITIAL_MESSAGES: Message[] = [
  { role: 'assistant', content: "Hello! I'm Majordom, your financial assistant. Ask me anything about your spending, accounts, or savings goals." }
]

const starterSuggestions = [
  'How much did I spend this month?',
  'Am I on budget?',
  'What are my biggest expenses?',
]

/**
 * Per-stream mirror of what the assistant produced, kept outside React state
 * so persistence can read it without side effects inside setMessages updaters
 * (updaters must be pure — StrictMode double-invokes them, which duplicated
 * persisted history entries; audit 2026-09-15 finding 59). `reply` mirrors the
 * content of the last assistant message created during this stream;
 * `replyAppendsToLast` tracks whether the next text chunk appends to it (true)
 * or starts a new assistant message (false). All updates happen in the stream
 * callbacks — never in an updater — so they run exactly once per chunk.
 */
interface StreamTracker {
  userText: string
  reply: string
  replyAppendsToLast: boolean
}

interface ChatProps {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
}

export default function Chat({ messages, setMessages, input, setInput }: ChatProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [sentHistory, setSentHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [savedInput, setSavedInput] = useState('')
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  // Photo picked in chat — while this is set, ReceiptFlow renders over the chat
  // (the same popup Add uses). Cleared when the flow closes.
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  // Active chat stream's AbortController — aborted on unmount so navigating
  // away doesn't leave the fetch/reader running (audit 2026-09-15 finding 49).
  const chatAbortRef = useRef<AbortController | null>(null)
  // BottomSheet already locks document.body on open — this only needs to
  // additionally freeze the nested scrollable message list, which has its
  // own overflow-y-auto and would otherwise keep scrolling under the sheet.
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.style.overflow = (showHelp || showMenu) ? 'hidden' : ''
    }
    return () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.style.overflow = ''
      }
    }
  }, [showHelp, showMenu])
  // Abort any in-flight chat stream when the page unmounts. The streaming
  // consumer swallows the resulting AbortError, so nothing user-visible fires.
  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort()
    }
  }, [])
  // Pre-fill the input from a "prefill" prompt — either router state (e.g.
  // tapping a "Needs attention" item on Home) or a `?prefill=` query param
  // (#12), which is all a cross-app link into the app can carry. Router state
  // wins when both are present. Never auto-sent: the user reviews/edits and
  // then confirms, same as any other write action (rule 30).
  useEffect(() => {
    const statePrefill = (location.state as { prefill?: string } | null)?.prefill
    const paramPrefill = new URLSearchParams(location.search).get('prefill')
    const prefill = statePrefill || paramPrefill
    if (prefill) {
      setInput(prefill)
      // Drop the prefill from the URL/state so a reload or back/forward doesn't
      // re-fill (and overwrite) whatever the user has typed since.
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.search])
  const csvInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaMenuRef = useRef<HTMLDivElement>(null)

  // Shared confirm/cancel handlers used by all “simple” card branches.
  const replaceWithStatus = useCallback((idx: number, message: string) => {
    setMessages(prev => prev.map((m, i) => i === idx ? { role: 'status' as const, content: message } : m))
  }, [setMessages])

  const cancelAt = useCallback((idx: number, message: string = 'Cancelled.') => {
    setMessages(prev => prev.map((m, i) => i === idx ? { role: 'status' as const, content: message } : m))
  }, [setMessages])

  // Plain text bubble used as fallback when no card dispatch matches.
  const renderDefaultMessage = (msg: Message): React.ReactNode => {
    return (
      <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
        <div
          className={`
            px-4 py-3 text-sm leading-relaxed rounded-2xl
            ${msg.role === 'user'
              ? 'bg-token-brand text-token-on-brand rounded-br-sm'
              : 'bg-token-surface border border-token-line text-token-ink rounded-bl-sm'
            }
          `}
        >
          {msg.role === 'assistant' ? (
            <div className="[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_li]:my-0 [&_a]:text-token-brand-ink [&_a]:underline">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          ) : (
            msg.content
          )}
        </div>
        {msg.ts && (
          <span className="text-[10px] text-token-ink-3 mt-1 px-1">
            {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    )
  }

  // role → renderer lookup table. SIMPLE branches delegate to replaceWithStatus/cancelAt.
  // BESPOKE branches reproduce their exact existing behaviour.
  const CARD_RENDER: Record<string, (msg: Message, idx: number) => React.ReactNode | null> = {
    status: (msg) => (
      <p className="text-xs text-token-ink-3 italic px-1">{msg.content}</p>
    ),
    budget_rebalance: (msg, idx) => {
      if (!msg.budgetRebalance) return null
      return (
        <BudgetRebalanceCard
          data={msg.budgetRebalance}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    proposal: (msg, idx) => {
      if (!msg.proposal) return null
      return (
        <ProposalCard
          proposal={msg.proposal}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    clarification: (msg, idx) => {
      if (!msg.clarification) return null
      return (
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
      )
    },
    setup_balances: (msg, idx) => {
      return (
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
      )
    },
    account_transfer: (msg, idx) => {
      if (!msg.accountTransfer) return null
      return (
        <AccountTransferCard
          data={msg.accountTransfer}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    balance_adjustment: (msg, idx) => {
      if (!msg.balanceAdjustment) return null
      return (
        <BalanceAdjustmentCard
          data={msg.balanceAdjustment}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    transfer_conversion: (msg, idx) => {
      if (!msg.transferConversion) return null
      return (
        <TransferConversionCard
          data={msg.transferConversion}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    close_account: (msg, idx) => {
      if (!msg.closeAccount) return null
      return (
        <CloseAccountCard
          data={msg.closeAccount}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    budget_overview: (msg, idx) => {
      if (!msg.budgetOverview) return null
      return (
        <BudgetOverviewCard
          data={msg.budgetOverview}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx, 'Closed.')}
        />
      )
    },
    category_overview: (msg, idx) => {
      if (!msg.categoryOverview) return null
      return (
        <CategoryOverviewCard
          data={msg.categoryOverview}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx, 'Closed.')}
        />
      )
    },
    category_action: (msg, idx) => {
      if (!msg.categoryAction) return null
      // Budget-copy is the simple variant; all other actions use the bespoke handler
      // that also handles chained offers (#76).
      if (msg.categoryAction.action === 'budget_copy') {
        return (
          <BudgetCopyCard
            data={msg.categoryAction}
            onConfirmed={(message) => replaceWithStatus(idx, message)}
            onCancelled={() => cancelAt(idx)}
          />
        )
      }
      if (msg.categoryAction.action === 'clear_reached_goals') {
        return (
          <ReachedGoalsCard
            data={msg.categoryAction}
            onConfirmed={(message) => replaceWithStatus(idx, message)}
            onCancelled={() => cancelAt(idx)}
          />
        )
      }
      return (
        <CategoryActionCard
          data={msg.categoryAction}
          onConfirmed={(message) => {
            // Chained cards persist themselves directly – see architecture.md rule 17.
            if (msg.chainedOfferText) {
              saveChatHistory([
                { role: 'assistant', content: msg.chainedOfferText },
                { role: 'status', content: message },
              ]).catch(() => {})
            }
            setMessages(prev =>
              prev.map((m, i) =>
                i === idx ? { role: 'status' as const, content: message, _synced: !!msg.chainedOfferText } : m
              )
            )
          }}
          onCancelled={() => {
            if (msg.chainedOfferText) {
              saveChatHistory([
                { role: 'assistant', content: msg.chainedOfferText },
                { role: 'status', content: 'Cancelled.' },
              ]).catch(() => {})
            }
            setMessages(prev =>
              prev.map((m, i) =>
                i === idx ? { role: 'status' as const, content: 'Cancelled.', _synced: !!msg.chainedOfferText } : m
              )
            )
          }}
        />
      )
    },
    goal_proposal: (msg, idx) => {
      if (!msg.goalProposal) return null
      return (
        <GoalProposalCard
          data={msg.goalProposal}
          onConfirmed={async (message, monthlyNeeded) => {
            replaceWithStatus(idx, message)
            if (monthlyNeeded && monthlyNeeded > 0) {
              const offerText = `To reach this goal, you'd need to put aside ${formatCurrency(monthlyNeeded, { decimals: 0 })}/mo. Want to add that to your Savings budget?`
              try {
                const proposal = await proposeSavingsBudget(monthlyNeeded)
                if ('type' in proposal && proposal.type === 'error') {
                  setMessages(prev => [...prev, { role: 'status' as const, content: proposal.message }])
                } else {
                  setMessages(prev => [
                    ...prev,
                    { role: 'assistant' as const, content: offerText },
                    {
                      role: 'category_action' as const,
                      content: '',
                      categoryAction: proposal as CategoryActionData,
                      chainedOfferText: offerText,
                    },
                  ])
                }
              } catch (err) {
                setMessages(prev => [...prev, { role: 'status' as const, content: err instanceof Error ? err.message : 'Failed to prepare budget update.' }])
              }
            }
          }}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    vehicle_log_action: (msg, idx) => {
      if (!msg.vehicleLogAction) return null
      return (
        <VehicleLogActionCard
          data={msg.vehicleLogAction}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    vehicle_reminder: (msg, idx) => {
      if (!msg.vehicleReminder) return null
      return (
        <VehicleReminderCard
          data={msg.vehicleReminder}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    vehicle_status: (msg, idx) => {
      if (!msg.vehicleStatus) return null
      return (
        <VehicleStatusCard
          data={msg.vehicleStatus}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    notification_time: (msg, idx) => {
      if (!msg.notificationTime) return null
      return (
        <NotificationTimeCard
          data={msg.notificationTime}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
    chart: (msg) => {
      if (!msg.chart) return null
      return <Chart {...msg.chart} />
    },
    transaction_list: (msg) => {
      if (!msg.transactionList) return null
      return <TransactionListCard {...msg.transactionList} />
    },
    fuelio_import: (msg) => {
      if (!msg.fuelioImport) return null
      return <FuelioImportCard data={msg.fuelioImport} />
    },
    csv_import: (msg, idx) => {
      if (!msg.csvImport) return null
      return (
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
          onCancelled={() => cancelAt(idx, 'Import cancelled.')}
        />
      )
    },
    income_source: (msg, idx) => {
      if (!msg.incomeRow) return null
      return (
        <IncomeSourceCard
          payee={msg.incomeRow.payee}
          amount={msg.incomeRow.amount}
          date={msg.incomeRow.date}
          onConfirmed={(message) => replaceWithStatus(idx, message)}
          // Note: IncomeSourceCard deliberately has no onCancelled prop.
        />
      )
    },
    fuel_log: (msg, idx) => {
      if (!msg.fuelLog) return null
      if (msg.fuelLog.fuelStats) {
        return <PendingFuelStatsDisplay draft={msg.fuelLog.draft} stats={msg.fuelLog.fuelStats} />
      }
      return (
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
          onCancelled={() => cancelAt(idx)}
        />
      )
    },
  }

  const renderMessage = (msg: Message, idx: number): React.ReactNode => {
    const render = CARD_RENDER[msg.role]
    if (render) {
      const output = render(msg, idx)
      if (output !== null && output !== undefined) return output
    }
    return renderDefaultMessage(msg)
  }

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Persist card resolutions (confirm/cancel) to server history.
  // Card flows (bank resync, category actions, transfers, ...) end by turning
  // the card message into a 'status' message — but unlike plain text replies,
  // nothing else saves that exchange server-side. Without this, the whole
  // exchange (including the user's own message) vanishes from chat history
  // the next time it reloads from the server (e.g. navigating away and back).
  // A WeakSet + the `_synced` flag (set on messages loaded from the server)
  // together ensure each locally-resolved status message is persisted exactly
  // once, and messages we just loaded from the server are never re-saved.
  const persistedStatusRef = useRef<WeakSet<Message>>(new WeakSet())
  useEffect(() => {
    messages.forEach((m, i) => {
      if (m.role !== 'status' || m._synced || persistedStatusRef.current.has(m)) return
      persistedStatusRef.current.add(m)
      const userMsg = [...messages.slice(0, i)].reverse().find(mm => mm.role === 'user')
      if (userMsg) {
        saveChatHistory([
          { role: 'user', content: userMsg.content },
          { role: 'status', content: m.content },
        ]).catch(() => {})
      }
    })
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
    // The popup does the upload/OCR itself — chat only hosts it and keeps the
    // one-line result `onSaved` hands back (see handleReceiptSaved).
    setReceiptFile(file)
  }

  // The popup reports its outcome once it has saved. A grocery receipt leaves a
  // single status line; a fuel one appends the refuel stats bubble, which the
  // existing `fuel_log` renderer already knows how to display.
  function handleReceiptSaved(result: ReceiptSaved) {
    if (result.kind === 'transaction') {
      setMessages(prev => [...prev, {
        role: 'status' as const,
        content: `Receipt saved: ${result.merchant} — ${formatCurrency(result.amount)}`,
      }])
      return
    }
    setMessages(prev => [...prev, {
      role: 'fuel_log' as const,
      content: '',
      fuelLog: { draft: result.draft, fuelStats: result.stats },
    }])
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

    const userMessage: Message = { role: 'user', content: text, ts: Date.now() }
    setMessages(prev => [...prev, userMessage])
    setLoading(true)

    // Exclude transaction exchanges from history — proposals are independent, previous amounts bleed into new calls.
    // Also exclude the user message that triggered a card (proposal, status, or any other non-text card role) —
    // immediately followed by one. Checked by role shape (not a hardcoded role list) so a new card type added
    // later is covered automatically, instead of silently leaving its triggering user message dangling with no
    // reply in the LLM's context (see #259 — this is exactly what caused a stale answer on the same question
    // re-asked right after a confirmed write).
    //
    // Beyond that: any assistant text reply that came BEFORE the most recent card is also dropped. A card
    // means something happened (most often a confirmed write) — the model's own earlier text answer may
    // describe state from before that, and re-asking the same/similar question later must not let the model
    // just repeat it (confirmed live for #259: a system-prompt instruction alone didn't stop this — the model
    // repeated its stale answer with no tool call twice in a row). Assistant text is only ever dropped, never
    // the user's own messages, and only text from before the last card — text after it already reflects the
    // latest state. Deliberately keyed on "any card", not just write-flagged ones, for the same
    // don't-hardcode-role-list reason as above — the cost of over-dropping (an occasional redundant but
    // correct tool call after a plain chart display) is negligible next to the cost of under-dropping (a wrong
    // answer reused after a real write).
    let lastCardIdx = -1
    messages.forEach((m, i) => {
      if (m.role !== 'user' && m.role !== 'assistant') lastCardIdx = i
    })
    const history = messages
      .filter((m, i) => {
        if (m.role !== 'user' && m.role !== 'assistant') return false
        if (m.role === 'user') {
          const next = messages[i + 1]
          if (next && next.role !== 'user' && next.role !== 'assistant') return false
        }
        if (m.role === 'assistant' && i < lastCardIdx) return false
        return true
      })
      .map(m => ({ role: m.role, content: m.content }))

    // Belt-and-braces: abort any stale stream before starting a new one —
    // the `loading` guard above already prevents concurrent sends.
    chatAbortRef.current?.abort()
    const controller = new AbortController()
    chatAbortRef.current = controller

    const stream: StreamTracker = { userText: text, reply: '', replyAppendsToLast: false }

    sendChatMessageStreaming(
      text,
      history,
      (chunk) => {
        handleChatChunk(chunk, stream)
      },
      () => {
        setLoading(false)
        // Save complete exchange to server history — only if the assistant
        // replied with text after the user message (i.e. the stream produced
        // any assistant text, mirrored in `stream.reply`). Runs here, after
        // the final state update, not inside a setMessages updater — see
        // StreamTracker above.
        if (stream.reply.trim()) {
          saveChatHistory([
            { role: 'user', content: stream.userText },
            { role: 'assistant', content: stream.reply },
          ]).catch(() => {})
        }
      },
      (error) => {
        console.error('Chat error:', error)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${error}`,
          ts: Date.now(),
        }])
        setLoading(false)
      },
      controller.signal
    )
  }

  // Handle a chunk from the chat stream. `stream` mirrors what the stream
  // produced (see StreamTracker) so the onComplete callback can persist the
  // exchange without reading state inside a setMessages updater.
  function handleChatChunk(chunk: string, stream: StreamTracker) {
    const trimmed = chunk.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        // A structured event ends the current streamed text segment (the next
        // text chunk starts a new assistant message) — unless the event itself
        // is assistant text, which the info/error branches re-mark below. The
        // previous value is restored for unknown payloads, which fall through
        // to the text path and behave exactly like a text chunk.
        const wasAppending = stream.replyAppendsToLast
        stream.replyAppendsToLast = false
        if (parsed.type === 'error') {
          stream.reply = parsed.message || 'Something went wrong.'
          stream.replyAppendsToLast = true
          // Tool-level errors (e.g. "no uncategorized transactions found for
          // payee X") skip the LLM and land here as raw JSON — never show
          // that to the user, render the human-readable message instead.
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: parsed.message || 'Something went wrong.',
            ts: Date.now(),
          }])
          return
        }
        if (parsed.type === 'info') {
          stream.reply = parsed.message || ''
          stream.replyAppendsToLast = true
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: parsed.message || '',
            ts: Date.now(),
          }])
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
        if (parsed.type === 'balance_adjustment') {
          setMessages(prev => [...prev, { role: 'balance_adjustment' as const, content: '', balanceAdjustment: parsed as BalanceAdjustmentData }])
          return
        }
        if (parsed.type === 'close_account') {
          setMessages(prev => [...prev, { role: 'close_account' as const, content: '', closeAccount: parsed as CloseAccountData }])
          return
        }
        if (parsed.type === 'transfer_conversion') {
          setMessages(prev => [...prev, { role: 'transfer_conversion' as const, content: '', transferConversion: parsed as TransferConversionData }])
          return
        }
        if (parsed.type === 'category_action') {
          setMessages(prev => [...prev, { role: 'category_action' as const, content: '', categoryAction: parsed as CategoryActionData }])
          return
        }
        if (parsed.type === 'category_overview') {
          setMessages(prev => [...prev, { role: 'category_overview' as const, content: '', categoryOverview: parsed as CategoryOverviewData }])
          return
        }
        if (parsed.type === 'budget_overview') {
          setMessages(prev => [...prev, { role: 'budget_overview' as const, content: '', budgetOverview: parsed as BudgetOverviewData }])
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
        if (parsed.type === 'vehicle_status') {
          setMessages(prev => [...prev, { role: 'vehicle_status' as const, content: '', vehicleStatus: parsed as VehicleStatusData }])
          return
        }
        if (parsed.type === 'notification_time') {
          setMessages(prev => [...prev, { role: 'notification_time' as const, content: '', notificationTime: parsed as NotificationTimeData }])
          return
        }
        if (parsed.type === 'chart') {
          setMessages(prev => [...prev, { role: 'chart' as const, content: '', chart: parsed }])
          // Charts are read-only display data (unlike proposal cards), so it's safe
          // to persist them verbatim — restores correctly after a refresh or
          // navigating away and back, instead of vanishing like other unresolved
          // cards (see the persistedStatusRef comment above for the same problem
          // affecting status cards). Persisted here, outside the updater — the
          // user message of this exchange is known (`stream.userText`).
          saveChatHistory([
            { role: 'user', content: stream.userText },
            { role: 'chart', content: JSON.stringify(parsed) },
          ]).catch(() => {})
          return
        }
        if (parsed.type === 'transaction_list') {
          setMessages(prev => [...prev, { role: 'transaction_list' as const, content: '', transactionList: parsed }])
          // Read-only display data (same reasoning as charts above) — safe to
          // persist verbatim so it survives a refresh instead of vanishing.
          saveChatHistory([
            { role: 'user', content: stream.userText },
            { role: 'transaction_list', content: JSON.stringify(parsed) },
          ]).catch(() => {})
          return
        }
        // Unknown structured payload — treated as plain text by the path below,
        // so restore the append tracking that the reset above interrupted.
        stream.replyAppendsToLast = wasAppending

      } catch {

        // Chunk may contain multiple JSON objects separated by newlines
        if (trimmed.includes('\n')) {
          for (const line of trimmed.split('\n')) {
            if (line.trim()) handleChatChunk(line, stream)
          }
          return
        }
      }
    }
    // Regular text chunk
    stream.reply = stream.replyAppendsToLast ? stream.reply + chunk : chunk
    stream.replyAppendsToLast = true
    setMessages(prev => {
      const newMessages = [...prev]
      const lastIndex = newMessages.length - 1
      if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
        newMessages[lastIndex] = { ...newMessages[lastIndex], content: newMessages[lastIndex].content + chunk }
      } else {
        newMessages.push({ role: 'assistant', content: chunk, ts: Date.now() })
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
    try {
      await clearChatHistory()
      setMessages(INITIAL_MESSAGES)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'status' as const, content: err instanceof Error ? err.message : 'Failed to clear chat history.' }])
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <PageHeader
        eyebrow="Your financial advisor"
        title="Majordom"
        actions={
          <>
            <IconButton icon={MoreVertical} onClick={() => setShowMenu(true)} label="More options" />
            {/* Bell + gear go through the shared cluster so Chat can't drift on
                order/size vs. the other tabs (#241). No Add here — the input
                bar's + button already owns photo/CSV attachment. */}
            <StandardHeaderActions variant="no-add" />
          </>
        }
      />

      {/* Overflow menu — Clear history + Help, moved off the header to make room for
          NotificationBell/Settings parity with the other tabs (#241). */}
      <BottomSheet open={showMenu} onClose={() => setShowMenu(false)} title="More options">
        <div className="-mx-6 border-t border-token-line divide-y divide-token-line">
          <button
            onClick={() => { setShowMenu(false); handleClearHistory() }}
            className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-white/5 transition-colors"
          >
            <Trash2 size={16} className="text-token-loss flex-shrink-0" />
            <span className="flex-1 text-token-ink text-sm">Clear chat history</span>
          </button>
          <button
            onClick={() => { setShowMenu(false); setShowHelp(true) }}
            className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-white/5 transition-colors"
          >
            <HelpCircle size={16} className="text-token-ink-3 flex-shrink-0" />
            <span className="flex-1 text-token-ink text-sm">How to use Majordom</span>
          </button>
        </div>
      </BottomSheet>

      {/* Help modal */}
      <BottomSheet open={showHelp} onClose={() => setShowHelp(false)} title="How to use Majordom">
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-token-ink font-medium mb-1">What is Majordom?</p>
                <p className="text-token-ink-3 leading-relaxed">Majordom is your personal finance assistant. Talk to it naturally — it understands your budget, accounts, and spending history.</p>
              </div>

              <div>
                <p className="text-token-ink font-medium mb-2">What you can ask</p>
                <ul className="space-y-1.5 text-token-ink-3">
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "How much did I spend on groceries this month?"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Am I over budget on restaurants?"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Transfer €200 from ING to savings"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Add a transaction — coffee at Starbucks, €4.50"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "What's my current balance?"</li>
                </ul>
              </div>

              <div>
                <p className="text-token-ink font-medium mb-2">Budget & goals</p>
                <p className="text-token-ink-3 mb-2">Goal tracking works by checking that your account balance is on target — you don't need to move money into a separate account.</p>
                <ul className="space-y-1.5 text-token-ink-3">
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Show me my budget for this month"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Set my Restaurants budget to €150"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Set a €5000 savings goal on my Car account by 2028"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Copy last month's budget to this month"</li>
                </ul>
              </div>

              <div>
                <p className="text-token-ink font-medium mb-2">Categories & rules</p>
                <ul className="space-y-1.5 text-token-ink-3">
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Create a category called Hobbies"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Always categorize Albert Heijn as Groceries"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Show me my uncategorized transactions"</li>
                </ul>
              </div>

              <div>
                <p className="text-token-ink font-medium mb-2">Vehicle tracking <span className="text-token-ink-3 font-normal">(if you've enabled the vehicle module)</span></p>
                <ul className="space-y-1.5 text-token-ink-3">
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> Photograph a gas station receipt — Majordom detects it's fuel and logs the refuel to the right vehicle automatically</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Log a refuel — 45 liters, €78"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "How many km until my next service?"</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> "Remind me before my APK expires"</li>
                </ul>
              </div>

              <div>
                <p className="text-token-ink font-medium mb-2">Import bank transactions</p>
                <p className="text-token-ink-3 leading-relaxed">Tap <span className="text-token-ink font-medium">+</span> in the input bar to:</p>
                <ul className="space-y-1 text-token-ink-3 mt-1">
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> Take a photo of a receipt</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> Upload a CSV export from your bank</li>
                </ul>
              </div>

              <div>
                <p className="text-token-ink font-medium mb-2">Tips</p>
                <ul className="space-y-1.5 text-token-ink-3">
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> Majordom learns your merchants — categories improve over time</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> Always review transactions marked with <span className="text-token-warn font-medium">?</span> before importing</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> Income and transfers need to be named once — Majordom remembers them</li>
                  <li className="flex gap-2"><span className="text-token-brand-ink">→</span> Ask "when's my next backup?" or "notify me at 8pm instead" to check or adjust alerts</li>
                </ul>
              </div>
            </div>
      </BottomSheet>

      {/* Message list */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {renderMessage(msg, idx)}
          </div>
        ))}

        {/* Loading indicator — hidden once text starts streaming in */}
        {loading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex items-end gap-2">
            <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3">
              <TypingDots />
            </div>
          </div>
        )}

        {/* Starter suggestions (only shown when there are only welcome message) */}
        {messages.length === 1 && (
          <div className="space-y-2 mt-6">
            <p className="text-token-ink-3 text-sm">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {starterSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="bg-token-surface hover:bg-token-surface-2 border border-token-line text-token-ink text-sm px-4 py-2 rounded-xl transition-colors"
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
        className="flex-shrink-0 bg-token-paper border-t border-token-line px-4 py-3 flex gap-2 items-end"
      >
        {/* + media button */}
        <div className="relative flex-shrink-0" ref={mediaMenuRef}>
          <button
            type="button"
            onClick={() => setShowMediaMenu(v => !v)}
            className={`
              w-10 h-10 rounded-xl border flex items-center justify-center transition-all
              ${showMediaMenu
                ? 'bg-token-brand border-token-brand text-token-on-brand'
                : 'bg-token-surface border-token-line text-token-ink-3 hover:border-token-brand hover:text-token-ink'}
            `}
            aria-label="Add media"
          >
            <Plus size={18} />
          </button>

          {showMediaMenu && (
            <div className="absolute bottom-12 left-0 w-[208px] bg-token-surface border border-token-line rounded-2xl shadow-xl overflow-hidden z-50">
              {([
                { icon: Camera,   label: 'Take photo',          action: () => cameraInputRef.current?.click() },
                { icon: Image,    label: 'Choose from gallery',  action: () => galleryInputRef.current?.click() },
                { icon: FileText, label: 'Upload CSV',           action: () => csvInputRef.current?.click() },
              ] as const).map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { action(); setShowMediaMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-token-ink hover:bg-token-surface-2 transition-colors text-left"
                >
                  <Icon size={16} className="text-token-ink-3 flex-shrink-0" />
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
            flex-1 bg-token-surface border border-token-line rounded-xl px-4 py-3
            text-token-ink text-sm placeholder:text-token-ink-3
            focus:outline-none focus:border-token-brand focus:ring-1 focus:ring-token-brand
            resize-none transition-colors
          "
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="
            w-10 h-10 rounded-xl bg-token-brand hover:bg-token-brand-2
            flex items-center justify-center flex-shrink-0
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-95 transition-all duration-150
          "
          aria-label="Send"
        >
          <Send size={16} className="text-token-ink" />
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

      {/* Receipt popup — the same flow Add opens. It portals itself to
          document.body, so rendering it here keeps it over the chat. */}
      {receiptFile && (
        <ReceiptFlow
          mode="photo"
          file={receiptFile}
          onClose={() => setReceiptFile(null)}
          onSaved={handleReceiptSaved}
        />
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-4">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-token-ink-3 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

/** Post-confirm fuel stats displayed as grey text after the card is confirmed. */
function PendingFuelStatsDisplay({ draft, stats }: {
  draft?: ReceiptDraft
  stats?: FuelConfirmResponse
}) {
  if (!stats) return null

  const vehicleName = draft?.vehicles?.find(v => v.id === draft?.suggested_vehicle_id)?.name ?? 'Vehicle'
  const name = stats.vehicle_name ?? vehicleName

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm max-w-[420px] w-full px-4 py-3 space-y-1">
      {stats.success ? (
        <>
          <p className="text-sm text-token-ink font-medium">✅ Refuel logged — {name}</p>
          {stats.liters != null && (
            <p className="text-xs text-token-ink-3">
              {stats.liters}L
              {stats.price_per_liter != null && ` → ${formatCurrency(stats.price_per_liter, { decimals: 3 })}/L`}
              {stats.fuel_grade && ` (${stats.fuel_grade})`}
            </p>
          )}
          {(stats.km_since_last != null || stats.consumption_l100km != null || stats.cost_per_km != null) && (
            <p className="text-xs text-token-ink-3">
              {stats.km_since_last != null && `+${formatNumber(stats.km_since_last)} km`}
              {stats.consumption_l100km != null && `  |  ${formatNumber(stats.consumption_l100km, 1)} L/100km`}
              {stats.cost_per_km != null && `  |  ${formatCurrency(stats.cost_per_km, { decimals: 3 })}/km`}
            </p>
          )}
          {draft?.merchant && <p className="text-xs text-token-ink-3">{draft.merchant}</p>}
        </>
      ) : (
        <p className="text-xs text-token-loss">
          ❌ Failed to save fuel receipt.
          {stats.error && <span className="text-token-ink-3"> — {stats.error}</span>}
        </p>
      )}
    </div>
  )
}
