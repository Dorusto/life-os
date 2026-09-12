import { authFetch, ApiError } from './auth'

export { ApiError }

const BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await authFetch(`${BASE}${path}`, options)

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

export async function listVehicles(): Promise<Vehicle[]> {
  return request<Vehicle[]>('/vehicle/list')
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

export async function linkVehicleAccount(id: number | string, abAccountId: string): Promise<Vehicle> {
  return request<Vehicle>(`/vehicle/${id}/link-account`, {
    method: 'POST',
    body: JSON.stringify({ ab_account_id: abAccountId }),
  })
}
