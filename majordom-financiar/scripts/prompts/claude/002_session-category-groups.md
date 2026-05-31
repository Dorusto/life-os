# Session start — Category groups (issue #74)

## Ce s-a terminat în sesiunea anterioară (2026-05-31)

- ✅ Onboarding cleanup — cod mort șters complet (service, API, router, Chat.tsx)
- ✅ Home screen redesign — Cashflow + Net Worth metric cards, Goals section
- ✅ Goals — `TARGET:<amount>` în nota contului AB → `set_account_goal` tool → progress bars pe Home
- ✅ Recent transactions eliminat din Home

## Ce facem în această sesiune

**Issue #74 — Category groups**

Acum tot sistemul (budget bars, stats, SmartCategorizer) lucrează cu **subcategorii** individuale.
Userul vrea să lucreze cu **7 grupuri principale**, cu expand opțional pe subcategorii.

### Structura de categorii — CONFIRMATĂ DE USER

7 categorii fixe, universale, exhaustive:

| # | Categorie | Ce acoperă | Subcategorii din `categories.json` |
|---|-----------|------------|-------------------------------------|
| 1 | 🏠 Housing | chirie, ipotecă, utilități, reparații, curățenie | Home & Maintenance, Utilities |
| 2 | 🛒 Daily Living | mâncare, igienă, îmbrăcăminte, copii, animale | Groceries & Drinks, Clothing, Children |
| 3 | 🚗 Transport | mașină, combustibil, transport public, moto, parking | Transport |
| 4 | 💊 Health | medicamente, doctor, sală, psiholog, asigurări sănătate | Health |
| 5 | 🎯 Lifestyle | restaurante, vacanțe, abonamente, hobby, cadouri | Restaurants & Cafes, Entertainment & Vacation, Personal |
| 6 | 💰 Finance | investiții, economii, asigurări, taxe, rate | Investments & Savings |
| 7 | ⚡ Unexpected | tot ce nu se încadrează — AI decide dacă creează subcategorie | Other |

**Nu mai e nevoie de confirmare — implementează direct.**

### Pasul 1 — Update `categories.json`

Adaugă câmpul `"group"` la fiecare categorie din `backend/core/config/categories.json`.
SmartCategorizer citește `name` și `keywords`, ignoră `group`.

### Pasul 2 — Backend: expune `group_name` în `/api/budget`

`get_budget_status()` în `client.py` returnează `category_name`. Adaugă `group_name`:
- `ActualBudgetClient.get_budget_status()` → lookup grup după `cat.group.name` din actualpy
- `BudgetCategory` model din `transactions.py` → câmp nou `group_name: str`

Fallback: dacă categoria din AB nu are grup → `"Unexpected"`.

### Pasul 3 — Frontend: BudgetDashboard cu grouping + expand

`frontend/src/components/BudgetDashboard.tsx` — afișează bare plate acum.

Comportament nou:
- Grupează categoriile după `group_name`
- O bară per grup (sum budgeted / sum spent)
- Tap pe grup → expand inline → bare individuale subcategorii
- Subcategoriile cu 0 budgeted și 0 spent → ascunse
- Ordinea fixă: Housing → Daily Living → Transport → Health → Lifestyle → Finance → Unexpected

### Pasul 4 — Auto-creare categorii în AB la setup

`backend/api/setup.py` → `POST /api/setup/complete`: dacă AB nu are nicio categorie →
creează cele 7 grupuri + subcategoriile din tabelul de mai sus.
`create_category_group()` și `create_category()` există deja în `client.py`.

## Fișiere cheie

- `backend/core/config/categories.json` — sursa de adevăr pentru categorii + grupuri
- `backend/core/actual_client/client.py` — `get_budget_status()`, `create_category_group()`, `create_category()`
- `backend/api/transactions.py` — `BudgetCategory` model, `/api/budget` endpoint
- `backend/api/setup.py` — `POST /api/setup/complete`
- `frontend/src/components/BudgetDashboard.tsx` — componenta de afișat
- `frontend/src/lib/api.ts` — `BudgetCategory` interface

## Înainte de a scrie cod

1. Citește `ARCHITECTURE.md`, `ROADMAP.md`
2. Rulează `gh issue list` și `gh issue view 74`
3. Citește fișierele cheie de mai sus
4. Implementează în ordinea pașilor 1 → 2 → 3 → 4
