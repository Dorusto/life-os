/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind only generates CSS for classes actually used in these files
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark palette inspired by Linear / Raycast.
        // Using CSS custom properties would also work, but inline colors
        // are easier to understand at a glance when reading component files.
        background: '#0F0F0F',   // page background
        surface:    '#1A1A1A',   // cards, inputs, modals
        'surface-2': '#222222',  // hover states, nested surfaces
        border:     '#2A2A2A',   // default border
        'border-hover': '#3D3D3D',
        accent:     '#6366F1',   // indigo-500 — primary action color
        'accent-hover': '#4F52D4',
        muted:      '#71717A',   // secondary text (zinc-500)
        'muted-2':  '#52525B',   // even more muted
        success:    '#22C55E',   // green-500
        danger:     '#EF4444',   // red-500

        // Semantic Card-system tokens (2026-07-07 Home redesign) — one role per
        // color, used by the shared <Card>/<InfoIcon> system and anything built
        // against the Financial Goals mockup. `accent`/`success` above are the
        // pre-existing app-wide colors (buttons, links, etc.) and are intentionally
        // left untouched for now rather than mass-renamed — see docs/decisions.md.
        positive:        '#22C55E', // motivational/positive (on-track, goal progress)
        'positive-dim':  '#1D3D2C',
        attention:       '#E8A838', // attention/warning (near-limit, behind schedule)
        'attention-dim': '#3D3320',
        info:            '#4F8EF7', // informational/neutral metric
        'info-dim':      '#1C2C47',
        interactive:     '#8B7BF0', // chat/CTA/active-tab accent for the new Card system
        'interactive-dim': '#241F47',
      },
      fontFamily: {
        // System font stack — no web font download, fast, looks native on iOS/Android
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Syne for display/headings
        display: ['Syne', 'sans-serif'],
        // DM Mono for numbers
        mono: ['DM Mono', 'monospace'],
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
