# Sesiunea următoare — #99: elimină merchant_mappings din SQLite, folosește istoricul AB

## Context

`merchant_mappings` (SQLite) duplică date pe care Actual Budget le are deja: de fiecare dată când o tranzacție e confirmată cu o categorie, AB reține deja `payee → category`. Tabelul SQLite e o a doua copie, întreținută independent, a aceluiași fapt — încalcă spiritul regulii "AB e singura sursă de adevăr pentru date financiare" (`docs/architecture.md`), deși e momentan o excepție documentată explicit, nu o încălcare (vezi diagrama din `architecture.md`, secțiunea Memory/SQLite).

M4.5 (condiția din issue: "After M4.5 is complete") e ✅ terminat — poți porni direct.

## Stare curentă (cercetat 2026-07-03, verifică înainte de a te baza pe ea — codul se poate fi schimbat)

`SmartCategorizer` (`backend/core/memory/categorizer.py`) are 3 niveluri:
1. **HISTORY** — `db.get_merchant_category(merchant)` → tabelul SQLite `merchant_mappings` (confidence până la 0.95) — **ăsta e nivelul pe care #99 vrea să-l elimine**
2. **KEYWORDS** — matching din `categories.json` + un tabel SQLite *separat* `category_keywords` (via `db.get_all_keywords()`/`db.add_keyword()`) — confidence 0.75
3. **FALLBACK** — `"other"`, confidence 0.0

**#99 vizează DOAR nivelul 1.** `category_keywords` e un subiect separat, nedecis încă — un audit anterior (#93, vezi `docs/sessions/2026-W27.md`) l-a lăsat deliberat neatins ("same spirit as merchant_mappings but not literally named in the whitelist — minor doc gap, not a code fix"). Nu-l amesteca în task-ul ăsta decât dacă userul cere explicit; dacă îl observi în timp ce lucrezi, semnalează-l, nu-l repara pe ascuns (păstrează raza de impact mică, "one feature at a time").

5 locuri folosesc `SmartCategorizer.predict()` și/sau `.learn()`:
1. `backend/services/receipt_service.py` — `predict()` pentru OCR de bon (~linia 101), `learn()` la confirmare (~linia 238)
2. `backend/api/csv_import.py` — `predict()` per rând (~linia 570), `learn()` la import confirmat (~linia 673)
3. `backend/tools/finance/actual_budget.py` — `SmartCategorizer().predict(payee, amount=amount)` în `propose_transaction` (~linia 112)
4. `backend/api/income_sources.py` — doar `learn()`, fără `predict()` (~liniile 80, 92) — mapează un payee direct la o categorie/transfer la configurare
5. `backend/core/actual_client/client.py` — parametru opțional `categorizer` la import batch, apelează `.predict()` per rând (~linia 1387)

Propunerea din issue: o metodă nouă `ActualBudgetClient.get_category_for_payee(payee_name) -> str | None` care interoghează istoricul de tranzacții din AB (cea mai recentă tranzacție categorizată pentru acel payee → categoria ei), folosită ca noul nivel 1. Dacă nu există potrivire în AB → fallback la nivelul 2 (keywords), la fel ca azi.

## IMPORTANT — nu porni implementarea direct

**Discută mai întâi cu userul, sunt decizii reale de arhitectură, nu doar mecanice:**

1. **Ce se întâmplă cu `learn()`?** Azi face două lucruri: salvează maparea merchant→categorie (partea care dispare) ȘI extrage+salvează keywords din textul OCR (nivelul 2, rămâne). Devine `learn()` doar-extractie-de-keywords, sau dispare complet (de vreme ce AB "învață" deja maparea automat în momentul în care tranzacția e confirmată cu o categorie — fără salvare explicită necesară)? Afectează punctele 1, 2, 4 de mai sus.
2. **`income_sources.py` (punctul 4) nu are un `predict()` corespondent** — e un `learn()` unidirecțional, folosit la configurarea explicită a userului ("acest payee e mereu venit din X"). Dacă `merchant_mappings` dispare, unde trăiește informația asta? Opțiuni: scrisă direct în AB cumva (o regulă? o tranzacție dummy?), sau acest flow nu mai are nevoie deloc de `SmartCategorizer`. Are nevoie de un răspuns real, nu de o presupunere.
3. **Forma query-ului / performanță** — `get_category_for_payee()` se va apela o dată per rând la import CSV și batch import (zeci de rânduri per import posibil). Confirmă că query-ul AB (ultima tranzacție categorizată per payee) e suficient de ieftin per-apel, sau dacă ar trebui să facă fetch batch (un map payee→categorie o singură dată per import) în loc de query per-rând — verifică `get_uncategorized_groups()` din `client.py`, care are deja un pattern similar (`history = actual.session.query(Transactions.category_id).filter(Transactions.payee_id == row.payee_id, ...)`) — reutilizează forma asta, nu inventa una nouă.
4. **Migrarea datelor existente** — există date în `merchant_mappings` pe producție care merită păstrate (re-derivarea e gratuită de vreme ce AB are deja tranzacțiile stau la bază, dar confirmă că nimic n-a fost salvat DOAR în `merchant_mappings` fără o tranzacție corespunzătoare în AB — ex. o mapare adăugată manual fără istoric de tranzacții încă).

## Pattern-uri existente de reutilizat, nu reinventat

- `docs/architecture.md` regula 20 (shared finance-calc helpers) — dacă o buclă payee→categorie există deja parțial în `get_uncategorized_groups()`, extinde/reutilizeaz-o în loc s-o duplici.
- `docs/decisions.md#93-code-audit` + secțiunea "Duplication & dead-code prevention" din `CLAUDE.md` — când punctele 1/2/4 de mai sus pierd dependența de `merchant_mappings`, șterge tabelul SQLite + metodele `MemoryDB.get_merchant_category`/`save_merchant_mapping` în ACELAȘI task, nu le lăsa cod mort "în caz că mai apelează ceva" (grep înainte, nu presupune).

## Protocol — nu uita

- Prezintă planul (3-5 linii) și cere confirmare explicită înainte de a scrie cod — mai ales având în vedere deciziile de mai sus.
- Testează live pe stack-ul local (`docker compose up -d --build majordom-api majordom-web`, ține minte corolarul regulii 19 — restart și la `majordom-web` dacă doar `majordom-api` a primit `--build`) — rulează chiar un import CSV/bon prin noul cod, nu doar citește diff-ul.
- Protocol complet de final din `CLAUDE.md`: self-check reguli aplicate, commit (18:00-23:00 ora locală), `gh issue close 99 -c "..."`, entry în `docs/sessions/` săptămâna curentă + rând în `INDEX.md`, actualizează `docs/architecture.md`/`decisions.md` dacă apare un pattern sau o decizie nouă.
