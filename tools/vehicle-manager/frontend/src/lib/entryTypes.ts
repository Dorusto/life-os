/** Display names for the `entry_type` values used as cost categories. */
const LABELS: Record<string, string> = {
  fuel: 'Fuel',
  service: 'Service',
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  tolls: 'Tolls',
  parking: 'Parking',
  tax: 'Tax',
  other: 'Other',
}

export function categoryLabel(entryType: string | null | undefined): string {
  const key = (entryType || 'other').toLowerCase()
  return LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}
