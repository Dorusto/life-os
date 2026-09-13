import { useState } from 'react'
import { confirmNotificationTime, cancelNotificationTime, type NotificationTimeData } from '../lib/api'
import ActionCardButtons from './ActionCardButtons'

interface Props {
  data: NotificationTimeData
  onConfirmed: (message: string) => void
  onCancelled: () => void
}

export default function NotificationTimeCard({ data, onConfirmed, onCancelled }: Props) {
  const [time, setTime] = useState(data.time)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const override = time !== data.time ? { time } : undefined
      const result = await confirmNotificationTime(data.id, override)
      onConfirmed(result.message)
    } catch (err) {
      onConfirmed(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try { await cancelNotificationTime(data.id) } catch {}
    onCancelled()
  }

  return (
    <div className="bg-token-surface border border-token-line rounded-2xl rounded-bl-sm px-4 py-3 w-[92%] max-w-sm space-y-3">
      <p className="text-token-ink font-medium">Update daily notification time</p>

      <div className="space-y-1">
        <p className="text-token-ink-3 text-xs">Time</p>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="w-full bg-token-paper border border-token-line rounded-xl px-3 py-2 text-token-ink text-sm outline-none focus:border-token-brand"
        />
      </div>

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} confirmDisabled={!time} confirmLabel="Save" />
    </div>
  )
}
