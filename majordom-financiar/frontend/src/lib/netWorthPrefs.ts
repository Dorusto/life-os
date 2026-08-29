const STORAGE_KEY = 'majordom_net_worth_include_prefs_v1'

type NetWorthCategory = 'Loan' | 'Vehicle' | 'Rental'

export type NetWorthIncludePrefs = Record<NetWorthCategory, boolean>

const DEFAULT_PREFS: NetWorthIncludePrefs = {
  Loan: true,
  Vehicle: true,
  Rental: true,
}

export function loadNetWorthIncludePrefs(): NetWorthIncludePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<NetWorthIncludePrefs>
    return {
      Loan: parsed.Loan ?? DEFAULT_PREFS.Loan,
      Vehicle: parsed.Vehicle ?? DEFAULT_PREFS.Vehicle,
      Rental: parsed.Rental ?? DEFAULT_PREFS.Rental,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveNetWorthIncludePrefs(prefs: NetWorthIncludePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage unavailable — ignore (private mode, quota)
  }
}
