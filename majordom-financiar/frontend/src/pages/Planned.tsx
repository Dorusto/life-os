import { useQuery } from '@tanstack/react-query'
import { getHomeData } from '../lib/api'
import GoalsSection from '../components/GoalsSection'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'

/**
 * Planned tab (decisions.md#planned-tab-added, superseding #nav-five-tabs) —
 * hosts Financial Goals as a dedicated page, not just a Dashboard widget.
 * Budgets/Recurring Payments are out of scope for now — Financial Goals is
 * the only section here until those get their own spec'd feature.
 */
export default function Planned() {
  const { data: homeData } = useQuery({
    queryKey: ['home'],
    queryFn: () => getHomeData(),
    staleTime: 120_000,
  })

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader label="Goals & budgeting" title="Planned" actions={<StandardHeaderActions />} />
      <section className="px-5 pt-3 pb-24">
        <GoalsSection fireData={homeData?.fire} goals={homeData?.goals} />
      </section>
    </div>
  )
}
