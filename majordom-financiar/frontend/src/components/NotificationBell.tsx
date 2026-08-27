import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronRight, Copy } from 'lucide-react'
import { getHomePending, getDuplicateMonths } from '../lib/api'
import IconButton from './IconButton'
import BottomSheet from './BottomSheet'

const PENDING_TAGS: Record<string, { label: string; className: string }> = {
  uncategorized: { label: 'finance', className: 'bg-info-dim text-info' },
  unreconciled: { label: 'finance', className: 'bg-info-dim text-info' },
  over_budget: { label: 'finance', className: 'bg-info-dim text-info' },
  vehicle_reminder: { label: 'vehicle', className: 'bg-attention-dim text-attention' },
}
const DEFAULT_PENDING_TAG = { label: 'finance', className: 'bg-info-dim text-info' }

/**
 * Consolidated notifications bell — uncategorized/needs-attention items and
 * suspected duplicates, both surfaced here instead of as separate header
 * icons or dashboard banners (decisions.md#nav-five-tabs). Shared across
 * every tab's header via StandardHeaderActions.
 */
export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const { data: pendingItems } = useQuery({
    queryKey: ['home-pending'],
    queryFn: () => getHomePending(),
    staleTime: 120_000,
  })
  const { data: duplicateMonths } = useQuery({
    queryKey: ['duplicates', 'months'],
    queryFn: () => getDuplicateMonths(),
    staleTime: 120_000,
  })
  const duplicateCount = duplicateMonths?.reduce((sum, m) => sum + m.count, 0) ?? 0
  const totalCount = (pendingItems?.length ?? 0) + (duplicateCount > 0 ? 1 : 0)

  return (
    <>
      <IconButton
        icon={Bell}
        onClick={() => setOpen(true)}
        label="Notifications"
        badge={totalCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-attention text-background text-[10px] font-bold flex items-center justify-center">
            {totalCount}
          </span>
        ) : undefined}
      />
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Notifications">
        {totalCount === 0 ? (
          <p className="text-muted text-xs py-2">You're all caught up.</p>
        ) : (
          <div className="-mx-6 border-t border-border divide-y divide-border">
            {duplicateCount > 0 && (
              <button
                onClick={() => { setOpen(false); navigate('/duplicates') }}
                className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-white/5 transition-colors"
              >
                <Copy size={16} className="text-info flex-shrink-0" />
                <span className="flex-1 text-white text-sm">
                  {duplicateCount} possible duplicate{duplicateCount !== 1 ? 's' : ''}
                </span>
                <ChevronRight size={14} className="text-muted flex-shrink-0" />
              </button>
            )}
            {pendingItems?.map((item, i) => {
              const tag = PENDING_TAGS[item.type] ?? DEFAULT_PENDING_TAG
              return (
                <button
                  key={i}
                  onClick={() => { setOpen(false); navigate('/chat', { state: { prefill: item.prompt } }) }}
                  className="w-full flex items-center justify-between gap-2 px-6 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-white text-sm">
                    {item.text}{' '}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tag.className}`}>{tag.label}</span>
                  </span>
                  <ChevronRight size={14} className="text-muted flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </BottomSheet>
    </>
  )
}
