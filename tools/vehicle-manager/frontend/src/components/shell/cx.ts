// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/shell/cx.ts.
// Run python3 scripts/sync_shared_frontend.py after editing the source, then commit both.

/** Joins class names, skipping falsy entries. Local so shared files import no app code. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
