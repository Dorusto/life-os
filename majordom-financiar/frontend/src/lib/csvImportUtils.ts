/**
 * Shared account-matching logic for CSV import (ImportPage + CsvImportCard).
 *
 * Plain substring matching fails for cases like source_name="crypto.com" vs
 * account name="Crypto card" — neither is a substring of the other. Word-token
 * overlap catches the shared "crypto" token instead.
 */

function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3)
}

export function matchAccountBySource<T extends { id: string; name: string }>(
  sourceName: string,
  accounts: T[],
): T | undefined {
  const srcTokens = normalizeTokens(sourceName)
  if (srcTokens.length === 0) return undefined
  return accounts.find(acc => {
    const accTokens = normalizeTokens(acc.name)
    return srcTokens.some(t => accTokens.includes(t))
  })
}
