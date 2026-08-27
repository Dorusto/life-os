import { BarChart3 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'

/**
 * Analytics tab — placeholder shell (decisions.md#nav-five-tabs). A UI
 * stand-in to make the 5-tab bar feel real; not yet scoped as a real issue.
 */
export default function AnalyticsPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader label="Coming soon" title="Analytics" actions={<StandardHeaderActions />} />
      <section className="flex-1 flex flex-col items-center justify-center gap-3 px-8 pb-24 text-center">
        <BarChart3 size={28} className="text-muted" />
        <p className="text-white text-sm font-semibold">Reports — coming soon</p>
        <p className="text-muted text-xs max-w-[26ch]">
          Expenses, income, and savings breakdowns are on the roadmap. Not yet scoped as a real issue.
        </p>
      </section>
    </div>
  )
}
