import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getVehicles, type Vehicle } from './api'

/**
 * The currently-selected vehicle, shared across the bottom-nav screens.
 *
 * Fuelio keeps a vehicle selector in the header of every main screen; this is
 * the equivalent. Persisted in localStorage so a refresh keeps the choice,
 * falling back to the first vehicle whenever the stored id no longer exists.
 */
const STORAGE_KEY = 'vehicle_manager_selected_vehicle'

export function getStoredVehicleId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function setStoredVehicleId(id: number): void {
  localStorage.setItem(STORAGE_KEY, String(id))
}

export function useSelectedVehicle() {
  const vehiclesQuery = useQuery({ queryKey: ['vehicles'], queryFn: getVehicles })
  const vehicles = vehiclesQuery.data ?? []
  const [selectedId, setSelectedId] = useState<number | null>(() => getStoredVehicleId())

  useEffect(() => {
    if (vehicles.length === 0) return
    const stillExists = selectedId != null && vehicles.some((v) => v.id === selectedId)
    if (!stillExists) {
      setSelectedId(vehicles[0].id)
      setStoredVehicleId(vehicles[0].id)
    }
  }, [vehicles, selectedId])

  const vehicle: Vehicle | undefined =
    vehicles.find((v) => v.id === selectedId) ?? vehicles[0]

  function select(id: number) {
    setStoredVehicleId(id)
    setSelectedId(id)
  }

  return {
    vehicles,
    vehicle,
    selectedId: vehicle?.id ?? null,
    select,
    isLoading: vehiclesQuery.isLoading,
    error: vehiclesQuery.error,
  }
}
