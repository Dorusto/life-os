import { authFetch, clearAuth } from './auth'
import type { LineData } from '../components/Chart'

const BASE = '/api'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await authFetch(`${BASE}${path}`, options)

  if (res.status === 401) {
    clearAuth()
    window.location.href = '/login'
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail || 'Request failed')
  }

  return res.json() as Promise<T>
}

export interface Vehicle {
  id: number
  name: string
  make: string | null
  model: string | null
  year: number | null
  plate: string | null
  vehicle_type: string | null
  active: boolean
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

export interface CreateVehicleInput {
  name: string
  make?: string
  model?: string
  year?: number
  plate?: string
  vehicle_type?: string
  purchase_price?: number | null
  purchase_date?: string | null
  vehicle_class?: string
  annual_depreciation_pct?: number | null
  salvage_floor_pct?: number
  manual_mileage?: number | null
}

export type PatchVehicleInput = Partial<CreateVehicleInput>

export interface ValueOverrideBody {
  mode: 'set' | 'adjust'
  value: number
  direction?: 'up' | 'down'
  date: string
  note?: string
}

export interface ValueOverrideResult {
  vehicle_id: number
  current_value: number
  ab_account_id: string | null
}

export interface ValueHistoryEntry {
  id: number
  value: number
  date: string
  note: string | null
  created_at: string
}

export interface ValueProjection {
  purchase: { date: string; value: number }
  today: { date: string; value: number }
  salvage_floor: number
  curve: { date: string; value: number }[]
  overrides: { date: string; value: number }[]
}

export interface RefetchConfig {
  mode: 'period_buttons'
  endpoint: string
  params: Record<string, string>
  period_param: 'months'
  periods: { label: string; value: number }[]
  current: number
  range?: { start: string; end: string } | null
}

export interface LineChartEnvelope {
  type: 'chart'
  chart_type: 'line'
  title: string
  data: LineData
  refetch: RefetchConfig
}

export async function listVehicles(): Promise<Vehicle[]> {
  return request<Vehicle[]>('/vehicle/list')
}

export async function getVehicle(id: number | string): Promise<Vehicle> {
  return request<Vehicle>(`/vehicle/${id}`)
}

export async function createVehicle(data: CreateVehicleInput): Promise<Vehicle> {
  return request<Vehicle>('/vehicle', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function patchVehicle(id: number | string, data: PatchVehicleInput): Promise<Vehicle> {
  return request<Vehicle>(`/vehicle/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function submitValueOverride(
  id: number | string,
  body: ValueOverrideBody
): Promise<ValueOverrideResult> {
  return request<ValueOverrideResult>(`/vehicle/${id}/value-override`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getValueHistory(id: number | string): Promise<ValueHistoryEntry[]> {
  return request<ValueHistoryEntry[]>(`/vehicle/${id}/value-history`)
}

export async function getValueProjection(
  id: number | string,
  years = 12
): Promise<ValueProjection> {
  const qs = new URLSearchParams({ years: String(years) })
  return request<ValueProjection>(`/vehicle/${id}/value-projection?${qs}`)
}

export async function getConsumptionChart(
  vehicleName: string,
  months = 12
): Promise<LineChartEnvelope> {
  const qs = new URLSearchParams({ vehicle_name: vehicleName, months: String(months) })
  return request<LineChartEnvelope>(`/vehicle/consumption-chart?${qs}`)
}

export async function getCostPerKmChart(
  vehicleName: string,
  months = 12
): Promise<LineChartEnvelope> {
  const qs = new URLSearchParams({ vehicle_name: vehicleName, months: String(months) })
  return request<LineChartEnvelope>(`/vehicle/cost-per-km-chart?${qs}`)
}

export async function getMonthlyCostChart(
  vehicleName: string,
  months = 12
): Promise<LineChartEnvelope> {
  const qs = new URLSearchParams({ vehicle_name: vehicleName, months: String(months) })
  return request<LineChartEnvelope>(`/vehicle/monthly-cost-chart?${qs}`)
}

export async function getMileageChart(
  vehicleName: string,
  months = 12
): Promise<LineChartEnvelope> {
  const qs = new URLSearchParams({ vehicle_name: vehicleName, months: String(months) })
  return request<LineChartEnvelope>(`/vehicle/mileage-chart?${qs}`)
}
