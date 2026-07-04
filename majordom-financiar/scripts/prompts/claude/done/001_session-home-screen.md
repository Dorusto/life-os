# Session start — Home screen redesign

## Ce s-a terminat în sesiunea anterioară (2026-05-31)

M2-NEW core complet:
- ✅ M2.3 — pending review nudge (low-confidence categorizations → push după 48h)
- ✅ M2.4 — import nudge (niciun import în N zile → push)
- ✅ M2.8 — post-import reconciliation card în chat
- ✅ SQLite cleanup: `budget_limits` și `transactions` tables șterse
- ✅ Transfer detection ING via Code=GT în builtin_profiles
- ✅ Bon inline în chat (ReceiptCard), fără pagina separată /receipt

## Ce facem în această sesiune

**Pasul 1 — Onboarding cleanup (~30 min)**

Codul de onboarding e mort (M2 a fost anulat, înlocuit cu M2-NEW). De șters:
- `backend/services/onboarding_service.py`
- `backend/api/onboarding.py`
- Router din `backend/main.py` (import + `app.include_router(onboarding.router, ...)`)
- Orice referință din `backend/api/chat.py` la onboarding
- Frontend: verifică dacă există vreo pagină/componentă de onboarding activă
- Tabela `onboarding_state` din schema `database.py` poate rămâne (are date, nu strică nimic)
- `ClarificationCard` se PĂSTREAZĂ — e folosit în alte fluxuri

**Pasul 2 — Home screen redesign (versiunea din ROADMAP)**

Layout țintă (din ROADMAP.md):
```
┌─────────────────────────────────────┐
│  [€ 1,240]   [€ 280,000]   [3.2%]  │  ← 3 cifre mari, glanceable
│  Cashflow    Net Worth      FIRE    │
├─────────────────────────────────────┤
│  Obligations                        │
│  ING Mortgage  €890/mo  €186k left  │
├─────────────────────────────────────┤
│  Budget — May                       │
│  category bars (ce există deja)     │
└─────────────────────────────────────┘
```

**Goals și FIRE % — skip pentru acum** (Goals nu există în AB, FIRE necesită date istorice).

### Surse de date necesare

**Cashflow** = income - expenses luna curentă. Disponibil via `/api/stats` (MonthlyStats).
Dar `MonthlyStats` returnează doar cheltuieli. Trebuie extins cu `income` dacă nu există deja.

**Net Worth** = suma tuturor soldurilor (on-budget + off-budget).
`get_accounts()` returnează acum doar on-budget. De extins în `ActualBudgetClient.get_accounts()`
să returneze și conturile off-budget, sau adaugă un endpoint separat `/api/accounts/networth`.

**Obligations** = plăți recurente din AB (scheduled transactions).
`actualpy` are `get_schedules()` sau echivalent — de verificat. Dacă nu există, skip pentru acum
și afișăm doar un placeholder.

**Budget bars** = deja implementate în Home.tsx prin `getBudgetStatus()`. Le păstrăm.

### Abordare recomandată

1. Extinde backend: adaugă `income` în `MonthlyStats` + endpoint `/api/accounts/networth`
2. Frontend `Home.tsx` (131 linii acum): rescrie cu noul layout
3. Obligations: încearcă `actualpy` scheduled transactions; dacă e complex, skip cu TODO

### Note tehnice

- `actualpy` — parametrul session se numește `s` (pozițional), nu `session`
- Toate scrierile în AB: `download_budget()` primul, `commit()` ultimul
- `ActualBudgetClient._run()` — wraps sync actualpy în ThreadPoolExecutor
- Conturile off-budget în actualpy: `get_accounts(actual.session)` returnează toate;
  filtrează cu `acc.offbudget == 1` pentru off-budget

## Fișiere cheie

- `backend/core/actual_client/client.py` — `get_accounts()`, `get_budget_status()`
- `backend/api/transactions.py` — `MonthlyStats`, `/api/stats` endpoint
- `frontend/src/pages/Home.tsx` — pagina curentă (131 linii)
- `frontend/src/lib/api.ts` — tipuri + funcții API

## Înainte de a scrie cod

1. Citește `ARCHITECTURE.md`, `ROADMAP.md`, `LEARN.md`
2. Rulează `gh issue list` pentru issues deschise relevante
3. Citește fișierele cheie de mai sus înainte de orice modificare
