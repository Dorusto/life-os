# Home screen UI redesign — typography + budget + goals cards

## Context

Majordom este un asistent financiar personal, PWA React + TypeScript + Tailwind. Dark theme.
Această sesiune redesignează exclusiv **Home screen-ul** — fără schimbări de backend, fără schimbări de API.

Referință vizuală: screenshot atașat de user (sesiunea 2026-05-31).

## Fișiere de modificat

- `frontend/index.html` — adaugă Google Fonts
- `frontend/tailwind.config.js` — adaugă fontFamily pentru Syne + DM Mono
- `frontend/src/pages/Home.tsx` — redesign Goals section + MetricCards
- `frontend/src/components/BudgetDashboard.tsx` — redesign complet

Nu modifica alte fișiere.

---

## Pasul 1 — Fonturi (Syne + DM Mono)

În `index.html`, în `<head>`, adaugă:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

În `tailwind.config.js`, în `theme.extend.fontFamily`:

```js
fontFamily: {
  sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
  display: ['Syne', 'sans-serif'],
  mono: ['DM Mono', 'monospace'],
},
```

Folosești `font-display` pentru headinguri mari, `font-mono` pentru numere.

---

## Pasul 2 — BudgetDashboard.tsx (redesign complet)

### Header nou

Structura vizuală țintă:
```
MAI 2026                              rămas
Budget                          +€5.050,00
€0,00 / €5.050,00 cheltuit  [€300.414,74 în conturi]
```

- `MAI 2026` — `text-xs tracking-widest uppercase text-muted`, stânga sus
- `Budget` — `font-display text-5xl font-bold text-white`, stânga
- `rămas` / `over budget` — `text-xs text-muted`, dreapta sus
- `+€5.050,00` — `font-display text-4xl font-bold` în verde (`#22C55E`) sau roșu
- `€X / €Y cheltuit` — `text-xs text-muted`, stânga jos
- `€X în conturi` — pill badge: `text-xs text-muted border border-border rounded-full px-3 py-1`, dreapta jos

### Rânduri categorii — fără progress bar

Fiecare rând: `dot colorat • Nume categorie` stânga | `€spent / €budget` centru | `XX%` dreapta.

**Fără progress bar.** Doar separatoare subtile (`border-b border-border/20`) între rânduri.

Dot-ul păstrează logica de culoare existentă (verde/galben/roșu după procent).

Structura unui rând:
```tsx
<div className="flex items-center justify-between py-3 border-b border-border/20 last:border-0">
  <div className="flex items-center gap-2">
    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    <span className="text-white text-sm">{category_name}</span>
  </div>
  <div className="flex items-center gap-3">
    <span className="text-muted text-xs font-mono tabular-nums">
      €{spent} / €{budgeted}
    </span>
    <span className="text-xs font-mono w-8 text-right" style={{ color }}>
      {percentage.toFixed(0)}%
    </span>
  </div>
</div>
```

Folosește `font-mono` pentru toate numerele în acest component.

---

## Pasul 3 — Home.tsx: Goals section redesign

### Header secțiune

Înlocuiește `<h2>Goals</h2>` cu:

```tsx
<p className="text-xs tracking-[0.2em] uppercase text-muted mb-4">Obiective Financiare</p>
```

### Goal cards cu bordură colorată

Fiecare goal primește o culoare din paleta ciclică (după index):

```ts
const GOAL_COLORS = ['#F59E0B', '#3B82F6', '#22C55E', '#8B5CF6', '#EC4899']
// index 0 = galben, 1 = albastru, 2 = verde, 3 = violet, 4 = roz
```

Structura unui card:

```tsx
<div
  key={goal.id}
  className="bg-surface rounded-2xl overflow-hidden"
  style={{ borderTop: `3px solid ${color}` }}
>
  <div className="px-4 pt-4 pb-3">
    {/* Linia 1: emoji + nume | target */}
    <div className="flex items-start justify-between mb-1">
      <p className="text-white font-semibold text-base">{goal.name}</p>
      <div className="text-right">
        <p className="font-display font-bold text-xl" style={{ color }}>
          €{formatGoalAmount(goal.target)}
        </p>
        <p className="text-muted text-xs">
          €{formatGoalAmount(goal.balance)} strâns
        </p>
      </div>
    </div>

    {/* Progress bar */}
    <div className="relative w-full h-1.5 bg-background rounded-full overflow-hidden mt-3">
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
        style={{
          width: `${Math.min(goal.percentage, 100)}%`,
          backgroundColor: color,
        }}
      />
    </div>

    {/* Linia de jos: Rămas */}
    <div className="flex items-center justify-between mt-2">
      <p className="text-muted text-xs">
        Rămas <span className="text-white font-mono">€{formatGoalAmount(goal.target - goal.balance)}</span>
      </p>
      <p className="text-xs font-mono" style={{ color }}>
        {goal.percentage.toFixed(0)}%
      </p>
    </div>
  </div>
</div>
```

### formatGoalAmount helper

```ts
function formatGoalAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return value.toLocaleString('nl-NL', { maximumFractionDigits: 0 })
  return value.toFixed(0)
}
```

### MetricCards — font display pentru valori

În `MetricCard`, înlocuiește `text-2xl font-bold` cu `font-display text-3xl font-bold` pe valoarea principală.

---

## Pasul 4 — Layout Home.tsx

Goals section scoasă din cardul `bg-surface` curent — fiecare goal e propriul card.
Spațierea între carduri: `space-y-3`.

Secțiunile pe Home în ordine:
1. Header (greeting + logout)
2. Notification banner (dacă e cazul)
3. MetricCards (Cashflow + Net Worth) — grid 2 col, rămâne ca acum
4. **OBIECTIVE FINANCIARE** + goal cards individuale
5. BudgetDashboard

---

## Reguli de implementare

- Nu schimba logica de date, query-uri, sau API calls
- Nu schimba alte componente în afara celor listate
- Păstrează toate className-urile de layout existente (px-5, pb-24, etc.)
- Formatarea numerelor rămâne `nl-NL` locale (punct mii, virgulă zecimale)
- `font-mono` pe toate numerele din BudgetDashboard și goal cards
