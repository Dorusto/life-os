/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Theming is driven entirely by the tokens below, swapped on
  // <html data-theme="dark">. This makes the `dark:` variant use the same
  // switch, in case a component ever needs it. No `dark:` classes are used
  // today — components reference tokens, not color literals.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      // Every color points at a CSS custom property in src/styles/tokens.css,
      // so the palette has exactly one definition. Opacity modifiers (e.g.
      // bg-ink/50) are intentionally not used — dedicated -soft tokens exist
      // instead, because a var() color can't be alpha-composited by Tailwind.
      colors: {
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
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
      fontSize: {
        // Tightened display ladder; body sizes stay on Tailwind's defaults.
        display: ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-sm': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
      },
    },
  },
  plugins: [],
}
