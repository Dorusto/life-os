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

### Pasul 0 — Confirmă structura de categorii (5 min, fără cod)

Tabelul propus în issue #74 (bazat pe ce există acum în AB):

| Grup | Subcategorii posibile |
|------|-----------------------|
| 🏠 Housing | Home, Utilities |
| 🛒 Daily Living | Groceries, Restaurants, Health |
| 🚗 Transport | Transport |
| 🎭 Entertainment | Divertisment, Vacation |
| 👤 Personal | Personal, Clothing, Children |
| 💰 Savings & Investments | Savings, Investments |
| 📦 Other | Other, Uncategorized |

**Înainte de orice cod:** cere userului să confirme sau ajusteze acest tabel.
Categoriile confirmate devin sursa de adevăr pentru tot ce urmează.

### Pasul 1 — Backend: expune `group_name` în `/api/budget`

`get_categories()` din actualpy returnează deja `cat.group.name` — nu e expus în API.

Fișiere de modificat:
- `backend/core/actual_client/client.py` → `get_budget_status()`: adaugă `group_name` în fiecare item din result
- `backend/api/transactions.py` → `BudgetCategory` model: adaugă `group_name: str`

### Pasul 2 — Frontend: BudgetDashboard cu grouping + expand

`frontend/src/components/BudgetDashboard.tsx` — componenta existentă afișează bare plate.

Comportament nou:
- Grupează categoriile după `group_name`
- Afișează o bară per grup (sum budgeted / sum spent)
- Tap pe grup → expand inline → bare individuale pentru subcategorii
- Subcategoriile cu 0 budgeted și 0 spent → ascunse

### Pasul 3 — Auto-creare categorii în AB la setup

`backend/api/setup.py` → `POST /api/setup/complete`: dacă AB nu are nicio categorie → creează grupurile + subcategoriile din structura confirmată.

`backend/core/actual_client/client.py` → deja există `create_category_group()` și `create_category()`.

### Pasul 4 — Update `categories.json`

`backend/core/memory/categories.json` (sau echivalentul) — înlocuiește cu subcategoriile confirmate.
SmartCategorizer sugerează la nivel de subcategorie (unchanged).

## Fișiere cheie

- `backend/core/actual_client/client.py` — `get_budget_status()`, `create_category_group()`, `create_category()`
- `backend/api/transactions.py` — `BudgetCategory` model, `/api/budget` endpoint
- `backend/api/setup.py` — `POST /api/setup/complete`
- `frontend/src/components/BudgetDashboard.tsx` — componenta de afișat
- `frontend/src/lib/api.ts` — `BudgetCategory` interface

## Înainte de a scrie cod

1. Citește `ARCHITECTURE.md`, `ROADMAP.md`
2. Rulează `gh issue list` și `gh issue view 74`
3. Citește fișierele cheie de mai sus
4. **Confirmă structura de categorii cu userul** — fără asta nu poți scrie nimic
