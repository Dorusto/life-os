import { authFetch, ApiError } from './auth'

export { ApiError }

// Same-origin: Nginx (production) / Vite dev proxy (development) forward
// /api/* (prefix stripped) to vehicle-manager's own API. Not a bare '' base —
// this app also has SPA routes under /vehicles/:id that would otherwise
// collide with the backend's own /vehicles/* paths (found live in Phase 4
// verification, fixed in nginx.conf/vite.config.ts alongside this).
const BASE = '/api'

export interface TokenResponse {
  access_token: string
  token_type: string
  username: string
}

// Full field set confirmed live against GET /vehicles/{id} (2026-09-12) — a
// superset of majordom-financiar's own trimmed Vehicle interface, which is
// missing the reminder fields (apk_due/insurance_due/service_interval_*)
// this app displays that majordom-financiar's UI never needed.
export interface Vehicle {
  id: number
  name: string
  make: string | null
  model: string | null
  year: number | null
  vin: string | null
  plate: string | null
  fuel_type: string | null
  tank_capacity: number | null
  vehicle_type: string | null
  active: number
  notes: string | null
  apk_due: string | null
  insurance_due: string | null
  apk_required: number
  service_interval_km: number | null
  service_interval_months: number | null
  last_service_km: number | null
  last_service_date: string | null
  purchase_price: number | null
  purchase_date: string | null
  vehicle_class: string | null
  annual_depreciation_pct: number | null
  salvage_floor_pct: number
  manual_mileage: number | null
  current_value: number | null
  ab_account_id: string | null
  last_odo: number | null
}

export interface ValueProjectionPoint {
  date: string
  value: number
}

export interface ValueProjection {
  purchase: { date: string; value: number }
  today: { date: string; value: number | null }
  salvage_floor: number
  curve: ValueProjectionPoint[]
  overrides: { date: string; value: number }[]
}

export interface ValueHistoryEntry {
  id: number
  date: string
  value: number
  note: string | null
}

export interface VehicleReminder {
  kind: string
  label: string
  due_date: string | null
  due_odo: number | null
  days_left: number | null
  km_left: number | null
  overdue: boolean
  progress: number | null
}

export interface VehicleSummary {
  vehicle_id: number
  avg_consumption: number | null
  last_consumption: number | null
  last_fuel_price: number | null
  last_fuel_date: string | null
  last_odo: number | null
  fill_count: number
  total_liters: number
  total_fuel_cost: number
  total_other_cost: number
  total_cost: number
  total_distance: number
  cost_per_km: number | null
  cost_this_month: number
  cost_this_year: number
  distance_this_month: number
  distance_this_year: number
  entry_count: number
  reminders: VehicleReminder[]
}

export interface VehicleStatsDetail {
  vehicle_id: number
  period: string
  costs: { total: number; this_year: number; this_month: number; prev_year: number; prev_month: number }
  bills: { lowest: number | null; highest: number | null }
  gas_price: { best: number | null; worst: number | null }
  cost_per_km: {
    average: number | null
    best: number | null
    worst: number | null
    best_month: string | null
    worst_month: string | null
  }
  cost_per_day: number | null
  cost_per_month: number | null
  fillups: { count: number; total_liters: number; total_cost: number; avg_consumption: number | null }
  distance: {
    total: number
    this_year: number
    this_month: number
    avg_per_month: number | null
    avg_per_day: number | null
  }
}

// Matches the {"type": "chart", "chart_type": ..., "title": ..., "data": {...}, "refetch"?: {...}}
// contract Chart.tsx renders — same shape majordom-financiar's chat tools/charts use.
export interface ChartResponse {
  type: 'chart' | 'error'
  chart_type?: 'line' | 'bar' | 'pie' | 'progress_list'
  title?: string
  data?: unknown
  refetch?: unknown
  message?: string
}

export interface VehicleLogEntry {
  id: number
  vehicle_id: number
  date: string
  odo_km: number | null
  entry_type: string
  fuel_liters: number | null
  fuel_price_per_liter: number | null
  fuel_full_tank: number
  fuel_missed: number
  cost_total: number | null
  cost_currency: string
  location: string | null
  notes: string | null
  vehicle_name?: string
}

// Fields a user fills in on the log-entry form — a subset of the backend's
// full VehicleLogEntry model (tools/vehicle-manager/app/models.py), which
// also carries import-specific fields (source, fuelio_unique_id, etc.) not
// relevant to a manually-added entry.
export interface NewVehicleLogEntry {
  date: string
  entry_type: string
  odo_km?: number | null
  fuel_liters?: number | null
  fuel_price_per_liter?: number | null
  fuel_full_tank?: boolean
  fuel_missed?: boolean
  cost_total?: number | null
  location?: string | null
  notes?: string | null
}

export interface LogInsertResult {
  inserted: number
  skipped: number
}

export interface FuelioImportResult {
  vehicle_name: string
  fuel_entries: number
  fuel_skipped: number
  cost_entries: number
  cost_skipped: number
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(`${BASE}${path}`)
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed: ${path}`)
  }
  return res.json() as Promise<T>
}

function chartQuery(months?: number, startDate?: string, endDate?: string): string {
  const params = new URLSearchParams()
  if (months != null) params.set('months', String(months))
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await authFetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, { redirectOn401: false })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new ApiError(res.status, body.detail || 'Login failed')
  }

  return res.json() as Promise<TokenResponse>
}

export async function getVehicles(): Promise<Vehicle[]> {
  return getJson<Vehicle[]>('/vehicles')
}

export interface VehiclePatch {
  apk_due?: string | null
  insurance_due?: string | null
  service_interval_km?: number | null
  service_interval_months?: number | null
  last_service_km?: number | null
  last_service_date?: string | null
  purchase_price?: number | null
  purchase_date?: string | null
  name?: string
}

export async function patchVehicle(id: number | string, updates: VehiclePatch): Promise<Vehicle> {
  const res = await authFetch(`${BASE}/vehicles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to update vehicle')
  }
  return res.json() as Promise<Vehicle>
}

export async function getVehicle(id: number | string): Promise<Vehicle> {
  return getJson<Vehicle>(`/vehicles/${id}`)
}

// A 404 here means "this vehicle has no purchase price set" — a real,
// permanent answer, not a transient failure. Callers should pass
// `retry: false, refetchInterval: false` on the useQuery wrapping this (same
// reasoning as majordom-financiar's own VehicleDetail.tsx) so the app-wide
// QueryClient default (retry-then-poll, meant for real transient failures)
// doesn't hammer an endpoint whose 404 will never resolve on its own.
export async function getValueProjection(id: number | string, years = 12): Promise<ValueProjection> {
  return getJson<ValueProjection>(`/vehicles/${id}/value-projection?years=${years}`)
}

export async function getValueHistory(id: number | string): Promise<ValueHistoryEntry[]> {
  return getJson<ValueHistoryEntry[]>(`/vehicles/${id}/value-history`)
}

export async function getVehicleSummary(id: number | string): Promise<VehicleSummary> {
  return getJson<VehicleSummary>(`/vehicles/${id}/summary`)
}

export async function getVehicleStatsDetail(
  id: number | string, period?: string
): Promise<VehicleStatsDetail> {
  const qs = period ? `?period=${encodeURIComponent(period)}` : ''
  return getJson<VehicleStatsDetail>(`/vehicles/${id}/stats-detail${qs}`)
}

export async function getCostCategories(
  id: number | string, includeFuel = true, period?: string
): Promise<ChartResponse> {
  const params = new URLSearchParams()
  if (!includeFuel) params.set('include_fuel', 'false')
  if (period) params.set('period', period)
  const qs = params.toString()
  return getJson<ChartResponse>(`/vehicles/${id}/cost-categories${qs ? `?${qs}` : ''}`)
}

export async function getConsumptionChart(
  id: number | string, months?: number, startDate?: string, endDate?: string
): Promise<ChartResponse> {
  return getJson<ChartResponse>(`/vehicles/${id}/consumption-chart${chartQuery(months, startDate, endDate)}`)
}

export async function getDistanceChart(
  id: number | string, months?: number, startDate?: string, endDate?: string
): Promise<ChartResponse> {
  return getJson<ChartResponse>(`/vehicles/${id}/distance-chart${chartQuery(months, startDate, endDate)}`)
}

export async function getCostPerKmChart(
  id: number | string, months?: number, startDate?: string, endDate?: string
): Promise<ChartResponse> {
  return getJson<ChartResponse>(`/vehicles/${id}/cost-per-km-chart${chartQuery(months, startDate, endDate)}`)
}

export async function getMonthlyCostChart(
  id: number | string, months?: number, startDate?: string, endDate?: string
): Promise<ChartResponse> {
  return getJson<ChartResponse>(`/vehicles/${id}/monthly-cost-chart${chartQuery(months, startDate, endDate)}`)
}

// mileage-chart takes no `months` param on the backend (main.py) — only
// start_date/end_date — unlike the other four chart endpoints.
export async function getMileageChart(
  id: number | string, startDate?: string, endDate?: string
): Promise<ChartResponse> {
  return getJson<ChartResponse>(`/vehicles/${id}/mileage-chart${chartQuery(undefined, startDate, endDate)}`)
}

export async function getVehicleLog(id: number | string, limit = 20): Promise<VehicleLogEntry[]> {
  return getJson<VehicleLogEntry[]>(`/vehicles/${id}/log?limit=${limit}`)
}

export async function addLogEntry(id: number | string, entry: NewVehicleLogEntry): Promise<LogInsertResult> {
  // Backend takes a JSON array (batch insert) — send a single-element array.
  const res = await authFetch(`${BASE}/vehicles/${id}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([entry]),
  })
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to add log entry')
  }
  return res.json() as Promise<LogInsertResult>
}

export async function deleteLogEntry(entryId: number): Promise<void> {
  const res = await authFetch(`${BASE}/log/${entryId}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to delete log entry')
  }
}

export async function importFuelio(file: File): Promise<FuelioImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await authFetch(`${BASE}/import/fuelio`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Import failed' }))
    throw new ApiError(res.status, body.detail || 'Import failed')
  }
  return res.json() as Promise<FuelioImportResult>
}
