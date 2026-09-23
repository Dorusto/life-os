// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/BrandMark.tsx.
// Run python3 scripts/sync_shared_frontend.py after editing the source, then commit both.

/**
 * The Majordom logo: a serif "M" (Instrument Serif, converted to a path so no
 * font has to load) on a rounded tile in the brand color. Rendered by every
 * app's rail and login screen; public/favicon.svg is the same drawing.
 * Change the mark here, run the sync script, and it changes everywhere.
 */

/** The glyph, drawn in a 100×100 box. Shared with favicon.svg. */
export const BRAND_MARK_PATH =
  'M48.4 81.1Q48.1 81.1 47.6 80.8Q47.2 80.6 47 79.7L33.6 25.2Q33.5 24.6 33.1 24.6Q32.6 24.7 32.6 25.3L30.8 74.4Q30.8 76.8 31.6 78.1Q32.5 79.4 34.8 79.8L35.9 80Q37.1 80 37.1 81Q37.1 82 35.7 82H23Q21.7 82 21.7 81Q21.7 80 22.8 80L24 79.8Q26.3 79.4 27.2 78.1Q28 76.8 28.1 74.4L29.9 23.9Q30 22 29.3 21.4Q28.7 20.8 26.7 20.4L24.6 20Q23.5 19.8 23.5 19Q23.5 18 24.8 18H35.5Q38.2 18 38.8 20.7L49.6 65Q49.8 65.6 50.2 65.6Q50.6 65.6 50.7 65L61.9 20.2Q62.4 18 64.7 18H75.2Q76.5 18 76.5 19Q76.5 19.8 75.4 20L73.3 20.4Q71.5 20.8 70.8 21.4Q70.2 22 70.3 23.9L72.1 76.1Q72.2 78 72.7 78.6Q73.2 79.2 75.1 79.6L77.2 80Q78.3 80.2 78.3 81Q78.3 82 77 82H60.9Q59.6 82 59.6 81Q59.6 80.2 60.7 80L62.8 79.6Q64.6 79.2 65.2 78.6Q65.9 78 65.8 76.1L64.3 25.3Q64.3 24.7 63.9 24.6Q63.5 24.6 63.3 25.1L49.8 79.7Q49.6 80.6 49.2 80.8Q48.8 81.1 48.4 81.1Z'

interface BrandMarkProps {
  /** Tile edge in px. */
  size?: number
  className?: string
}

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Majordom"
      className={['shrink-0 text-brand', className].filter(Boolean).join(' ')}
    >
      <rect width="100" height="100" rx="24" fill="currentColor" />
      <path d={BRAND_MARK_PATH} fill="var(--on-brand)" />
    </svg>
  )
}
