// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/shell/AppearanceSettings.tsx.
// Run python3 scripts/sync_shared_frontend.py after editing the source, then commit both.

import { Check, Moon, Sun } from 'lucide-react'
import { useAppearance, ACCENTS, type Accent } from './appearance'
import { cx } from './cx'

const ACCENT_LABEL: Record<Accent, string> = { sage: 'Sage', amber: 'Amber', olive: 'Olive', slate: 'Slate' }

const pill = (active: boolean) =>
  cx(
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-xs transition-colors',
    active ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink',
  )

/**
 * Settings → Appearance, identical in every app: light/dark and the accent color used for
 * charts, progress and highlights. "App default" follows the accent this app ships with.
 */
export function AppearanceSettings({ appDefault }: { appDefault: Accent }) {
  const { theme, setTheme, accent, setAccent, effectiveAccent } = useAppearance(appDefault)

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-sm font-medium text-ink">Theme</p>
          <p className="text-xs text-ink-3">Stored on this device.</p>
        </div>
        <div role="radiogroup" aria-label="Theme" className="flex gap-0.5 rounded-full border border-line bg-paper p-[3px]">
          <button type="button" role="radio" aria-checked={theme === 'dark'} onClick={() => setTheme('dark')} className={pill(theme === 'dark')}>
            <Moon className="h-3.5 w-3.5" aria-hidden />Dark
          </button>
          <button type="button" role="radio" aria-checked={theme === 'light'} onClick={() => setTheme('light')} className={pill(theme === 'light')}>
            <Sun className="h-3.5 w-3.5" aria-hidden />Light
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-ink">Accent</p>
          <p className="text-xs text-ink-3">Charts, progress bars and highlights.</p>
        </div>
        <div role="radiogroup" aria-label="Accent" className="flex flex-wrap items-center gap-2">
          <button type="button" role="radio" aria-checked={accent === null} onClick={() => setAccent(null)} className={pill(accent === null)}>
            App default
          </button>
          {ACCENTS.map(value => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={accent === value}
              aria-label={ACCENT_LABEL[value]}
              title={ACCENT_LABEL[value]}
              onClick={() => setAccent(value)}
              data-accent-swatch={value}
              className={cx(
                'relative inline-flex h-8 w-8 items-center justify-center rounded-full border-2',
                effectiveAccent === value ? 'border-ink' : 'border-transparent',
              )}
            >
              <span className="h-5 w-5 rounded-full" style={{ background: `var(--swatch-${value})` }} />
              {accent === value && <Check className="absolute h-3 w-3 text-paper" aria-hidden />}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
