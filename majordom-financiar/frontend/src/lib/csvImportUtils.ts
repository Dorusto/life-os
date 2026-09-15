/**
 * Shared account-matching logic for CSV import (ImportPage + CsvImportCard).
 *
 * Plain substring matching fails for cases like source_name="crypto.com" vs
 * account name="Crypto card" — neither is a substring of the other. Word-token
 * overlap catches the shared "crypto" token instead.
 *
 * tokenizeName() is also the merchant tokenizer behind CsvImportCard's
 * merchant-similarity propagation (second occurrence → shared, per the
 * duplication-prevention rule). It strips digits, so a store number or
 * address suffix the bank appends never dilutes the match.
 */
export function tokenizeName(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3)
}

export function matchAccountBySource<T extends { id: string; name: string }>(
  sourceName: string,
  accounts: T[],
): T | undefined {
  const srcTokens = tokenizeName(sourceName)
  if (srcTokens.length === 0) return undefined
  return accounts.find(acc => {
    const accTokens = tokenizeName(acc.name)
    return srcTokens.some(t => accTokens.includes(t))
  })
}
