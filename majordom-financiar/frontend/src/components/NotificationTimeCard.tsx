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
    <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3 w-[92%] max-w-sm space-y-3">
      <p className="text-white font-medium">Update daily notification time</p>

      <div className="space-y-1">
        <p className="text-muted text-xs">Time</p>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-accent"
        />
      </div>

      <ActionCardButtons onConfirm={handleConfirm} onCancel={handleCancel} loading={loading} confirmDisabled={!time} confirmLabel="Save" />
    </div>
  )
}
