import { Check, X, type LucideIcon } from 'lucide-react'

interface ActionCardButtonsProps {
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
  confirmDisabled?: boolean
  confirmLabel?: string
  cancelLabel?: string
  confirmIcon?: LucideIcon
  variant?: 'default' | 'danger'
  order?: 'confirm-first' | 'cancel-first'
}

export default function ActionCardButtons({
  onConfirm,
  onCancel,
  loading,
  confirmDisabled = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmIcon: ConfirmIcon = Check,
  variant = 'default',
  order = 'confirm-first',
}: ActionCardButtonsProps) {
  const confirmButton = (
    <button
      key="confirm"
      onClick={onConfirm}
      disabled={loading || confirmDisabled}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-sm font-medium transition-colors active:scale-95 disabled:opacity-40 whitespace-nowrap ${
        variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:bg-accent-hover'
      }`}
    >
      <ConfirmIcon size={14} />
      {confirmLabel}
    </button>
  )

  const cancelButton = (
    <button
      key="cancel"
      onClick={onCancel}
      disabled={loading}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-muted hover:text-white hover:bg-surface-hover text-sm font-medium transition-colors active:scale-95 disabled:opacity-40 whitespace-nowrap"
    >
      <X size={14} />
      {cancelLabel}
    </button>
  )

  return (
    <div className="flex gap-2">
      {order === 'confirm-first' ? [confirmButton, cancelButton] : [cancelButton, confirmButton]}
    </div>
  )
}
