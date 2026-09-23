import { useCallback, useState } from 'react'

/**
 * Theme + accent, shared by every app. Both are attributes on <html> read by tokens.css
 * (data-theme, data-accent). Each app's index.html sets its default accent and runs a tiny
 * pre-paint script applying the stored choice before React loads, so there is no flash.
 * Origins differ per app, so the stored choice is per app automatically.
 */
export type Theme = 'light' | 'dark'
export type Accent = 'sage' | 'amber' | 'olive' | 'slate'

export const ACCENTS: Accent[] = ['sage', 'amber', 'olive', 'slate']

const THEME_KEY = 'majordom_theme'
const ACCENT_KEY = 'majordom_accent'
const THEME_COLOR: Record<Theme, string> = { light: '#f4f3ef', dark: '#131312' }

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
}

export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/** The accent the user picked, or null when following the app's default. */
export function storedAccent(): Accent | null {
  const value = read(ACCENT_KEY)
  return value && (ACCENTS as string[]).includes(value) ? (value as Accent) : null
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

export function useAppearance(appDefault: Accent) {
  const [theme, setThemeState] = useState<Theme>(currentTheme)
  const [accent, setAccentState] = useState<Accent | null>(storedAccent)

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next)
    write(THEME_KEY, next)
    setThemeState(next)
  }, [])

  /** null = back to the app's default accent. */
  const setAccent = useCallback((next: Accent | null) => {
    document.documentElement.setAttribute('data-accent', next ?? appDefault)
    write(ACCENT_KEY, next)
    setAccentState(next)
  }, [appDefault])

  return { theme, setTheme, accent, setAccent, effectiveAccent: accent ?? appDefault }
}
