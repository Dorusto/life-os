/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind only generates CSS for classes actually used in these files
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Same bare keys as tools/vehicle-manager and tools/investment-manager, so a component
        // shared through packages/frontend-shared uses identical class names in every app.
        // The old flat hex keys (background/surface/border/accent/muted/...) are gone —
        // they were the only reason for the token.* namespace below (decided 2026-09-23).
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-sunken': 'var(--surface-sunken)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        overlay: 'var(--overlay)',
        brand: 'var(--brand)',
        'brand-2': 'var(--brand-2)',
        'brand-soft': 'var(--brand-soft)',
        'brand-ink': 'var(--brand-ink)',
        'on-brand': 'var(--on-brand)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        gain: 'var(--gain)',
        'gain-soft': 'var(--gain-soft)',
        loss: 'var(--loss)',
        'loss-soft': 'var(--loss-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        info: 'var(--info)',
        'info-soft': 'var(--info-soft)',

        // Legacy alias of the bare keys above, kept so the ~70 files already written
        // against it keep working. New code uses the bare keys; migrating the old call
        // sites is mechanical and happens as files are touched.
        token: {
          paper: 'var(--paper)',
          surface: 'var(--surface)',
          'surface-2': 'var(--surface-2)',
          'surface-sunken': 'var(--surface-sunken)',
          ink: 'var(--ink)',
          'ink-2': 'var(--ink-2)',
          'ink-3': 'var(--ink-3)',
          line: 'var(--line)',
          'line-strong': 'var(--line-strong)',
          overlay: 'var(--overlay)',
          brand: 'var(--brand)',
          'brand-2': 'var(--brand-2)',
          'brand-soft': 'var(--brand-soft)',
          'brand-ink': 'var(--brand-ink)',
          'on-brand': 'var(--on-brand)',
          accent: 'var(--accent)',
          'accent-soft': 'var(--accent-soft)',
          gain: 'var(--gain)',
          'gain-soft': 'var(--gain-soft)',
          loss: 'var(--loss)',
          'loss-soft': 'var(--loss-soft)',
          warn: 'var(--warn)',
          'warn-soft': 'var(--warn-soft)',
          info: 'var(--info)',
          'info-soft': 'var(--info-soft)',
          c1: 'var(--c1)',
          c2: 'var(--c2)',
          c3: 'var(--c3)',
          c4: 'var(--c4)',
          c5: 'var(--c5)',
          c6: 'var(--c6)',
        },
      },
      fontFamily: {
        // IBM Plex Sans/Mono (ported from investment-manager) are now the
        // app's only fonts, including the Tailwind base/preflight default —
        // Syne (`display`) and DM Mono (`mono`) retired 2026-09-13 once the
        // whole-app color/token migration confirmed nothing referenced them.
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'plex-sans': ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Bare `mono` matches Transport/Invest so shared components can use font-mono.
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        'plex-mono': ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['Instrument Serif', 'Georgia', 'Times New Roman', 'serif'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [
    // Adds pb-safe / pt-safe etc. for iOS home indicator (env(safe-area-inset-*))
    function({ addUtilities }) {
      addUtilities({
        '.pb-safe': { paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
        '.pt-safe': { paddingTop: 'env(safe-area-inset-top, 0px)' },
      })
    },
  ],
}
