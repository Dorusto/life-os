/** Joins class names, skipping falsy entries. Local so shared files import no app code. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
