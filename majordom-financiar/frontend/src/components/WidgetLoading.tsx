import { Loader2 } from 'lucide-react'

/**
 * The "still fetching" row every Dashboard/Planned widget shows before its data arrives.
 *
 * Why this exists: widgets used to render their empty state while the query was still
 * pending, so the Dashboard opened by telling the user they had no goals, no transactions
 * and no spending — then silently replaced all three once the data landed. "Nothing yet"
 * and "nothing at all" are different answers and must look different. See
 * docs/audit-2026-08.md (F23) and issue #212.
 *
 * Use this whenever a widget's data can be undefined because it hasn't loaded, and keep the
 * genuine empty state for a query that resolved to nothing.
 */
export default function WidgetLoading({ label, className = 'py-3' }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-muted text-xs ${className}`}>
      <Loader2 size={14} className="animate-spin" />
      {label}
    </div>
  )
}
