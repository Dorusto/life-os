import { Table2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'

/**
 * Transactions tab — placeholder shell. The real bulk table (Filters sheet,
 * checkbox bulk-select, list/table view toggle) is #184.
 */
export default function TransactionsPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader label="Coming soon" title="Transactions" actions={<StandardHeaderActions />} />
      <section className="flex-1 flex flex-col items-center justify-center gap-3 px-8 pb-24 text-center">
        <Table2 size={28} className="text-muted" />
        <p className="text-white text-sm font-semibold">Full transaction table — coming soon</p>
        <p className="text-muted text-xs max-w-[26ch]">
          Filters, bulk-select, and list/table view are being built next (#184). Latest activity is on the Dashboard for now.
        </p>
      </section>
    </div>
  )
}
