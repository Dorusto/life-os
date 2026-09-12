/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind only generates CSS for classes actually used in these files
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Same dark palette as majordom-financiar/frontend — kept identical so
        // the copied Chart.tsx (and the shared look/feel) work unmodified.
        background: '#0F0F0F',   // page background
        surface:    '#1A1A1A',   // cards, inputs, modals
        'surface-2': '#222222',  // hover states, nested surfaces
        border:     '#2A2A2A',   // default border
        'border-hover': '#3D3D3D',
        accent:     '#6366F1',   // indigo-500 — primary action color
        'accent-hover': '#4F52D4',
        muted:      '#71717A',   // secondary text (zinc-500)
        'muted-2':  '#82828C',   // ~5:1 contrast against #0F0F0F background (WCAG AA)
        success:    '#22C55E',   // green-500
        danger:     '#EF4444',   // red-500
      },
      fontFamily: {
        // System font stack — no web font download, fast, looks native on iOS/Android
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
