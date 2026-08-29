import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Wallet, Plus } from 'lucide-react'
import { getAccountList, type AccountListItem } from '../lib/api'
import { listVehicles, type Vehicle } from '../lib/vehicleValueApi'
import PageHeader from '../components/PageHeader'
import StandardHeaderActions from '../components/StandardHeaderActions'
import EditVehicleModal from '../components/vehicles/EditVehicleModal'
import { formatCurrency } from '../lib/formatCurrency'

/**
 * Accounts tab (decisions.md#nav-five-tabs) — a real, live list of Actual
 * Budget accounts; tapping a row drills down into that account (#194).
 *
 * Vehicle-tagged accounts (account_type === 'Vehicle') also appear in their
 * own "VEHICLES" section, linked to vehicle-manager records by
 * vehicle.ab_account_id === account.id.
 */
export default function Accounts() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [addVehicleOpen, setAddVehicleOpen] = useState(false)

  const { data: accounts } = useQuery({
    queryKey: ['account-list'],
    queryFn: () => getAccountList(),
    staleTime: 120_000,
  })

  const { data: vehicles } = useQuery({
    queryKey: ['vehicle-list'],
    queryFn: () => listVehicles(),
    staleTime: 120_000,
  })

  const total = accounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0
  const nonVehicleAccounts = accounts?.filter(a => a.account_type !== 'Vehicle') ?? []
  const vehicleAccounts = accounts?.filter(a => a.account_type === 'Vehicle') ?? []
  const onBudget = nonVehicleAccounts.filter(a => !a.off_budget)
  const offBudget = nonVehicleAccounts.filter(a => a.off_budget)
  const vehicleSubtotal = vehicleAccounts.reduce((sum, a) => sum + a.balance, 0)

  async function handleVehicleSaved(createdVehicleId?: number) {
    await queryClient.invalidateQueries({ queryKey: ['vehicle-list'] })
    await queryClient.invalidateQueries({ queryKey: ['account-list'] })
    if (createdVehicleId) {
      navigate(`/accounts/vehicle/${createdVehicleId}`)
    }
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto">
      <PageHeader
        label={accounts ? `${accounts.length} account${accounts.length !== 1 ? 's' : ''} · Actual Budget` : 'Actual Budget'}
        title="Accounts"
        actions={<StandardHeaderActions />}
      />
      <section className="px-5 pt-2 pb-24">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Total</p>
        <p className="font-mono font-medium text-3xl mt-1 tabular-nums">
          {formatCurrency(total, { decimals: 0 })}
        </p>

        <div className="flex items-center justify-between mt-6 mb-2">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Vehicles</p>
          <button
            type="button"
            onClick={() => setAddVehicleOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:opacity-80 transition-opacity"
          >
            <Plus size={13} />
            Add vehicle
          </button>
        </div>
        {vehicleAccounts.length > 0 && (
          <>
            <p className="font-mono font-medium text-3xl mt-1 tabular-nums">
              {formatCurrency(vehicleSubtotal, { decimals: 0 })}
            </p>
            <div className="space-y-2.5 mt-3">
              {vehicleAccounts.map(account => {
                const vehicle = vehicles?.find(v => v.ab_account_id === account.id)
                return <VehicleAccountRow key={account.id} account={account} vehicle={vehicle} />
              })}
            </div>
          </>
        )}
        {vehicleAccounts.length === 0 && (
          <p className="text-muted text-xs">No vehicles yet.</p>
        )}

        {onBudget.length > 0 && (
          <>
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted mt-6 mb-2">On budget</p>
            <div className="space-y-2.5">
              {onBudget.map(a => <AccountRow key={a.id} account={a} />)}
            </div>
          </>
        )}
        {offBudget.length > 0 && (
          <>
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted mt-6 mb-2">Off budget</p>
            <div className="space-y-2.5">
              {offBudget.map(a => <AccountRow key={a.id} account={a} />)}
            </div>
          </>
        )}
      </section>

      <EditVehicleModal
        open={addVehicleOpen}
        onClose={() => setAddVehicleOpen(false)}
        onSaved={handleVehicleSaved}
      />
    </div>
  )
}

function AccountRow({ account }: { account: AccountListItem }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/accounts/${account.id}`)}
      className="w-full flex items-center gap-3 bg-surface border border-border rounded-2xl px-3.5 py-3.5 text-left hover:bg-surface-2 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center text-muted flex-shrink-0">
        <Wallet size={16} />
      </div>
      <p className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{account.name}</p>
      <p className="font-mono text-sm tabular-nums flex-shrink-0">
        {formatCurrency(account.balance, { decimals: 0 })}
      </p>
    </button>
  )
}

function VehicleAccountRow({ account, vehicle }: { account: AccountListItem; vehicle?: Vehicle }) {
  const navigate = useNavigate()
  const clickable = Boolean(vehicle)

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => {
        if (vehicle) navigate(`/accounts/vehicle/${vehicle.id}`)
      }}
      className={`w-full flex items-center gap-3 bg-surface border border-border rounded-2xl px-3.5 py-3.5 text-left transition-colors ${
        clickable ? 'hover:bg-surface-2' : 'opacity-60 cursor-not-allowed'
      }`}
    >
      <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center text-muted flex-shrink-0">
        <Wallet size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold truncate">{account.name}</p>
        {vehicle && (
          <p className="text-[11.5px] text-muted truncate">
            {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
            {vehicle.year ? ` · ${vehicle.year}` : ''}
          </p>
        )}
      </div>
      <p className="font-mono text-sm tabular-nums flex-shrink-0">
        {formatCurrency(account.balance, { decimals: 0 })}
      </p>
    </button>
  )
}
