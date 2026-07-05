# Sesiunea următoare — #143: audit de cod — depistare logică duplicată în 2+ locuri

## Context

Ultimul audit complet a fost #93 (2026-07-03). De atunci au ieșit zeci de feature-uri/fix-uri (#99, #101, #102, #110-114, #138, #145, #147-152, #154-158...) — mult peste pragul de "10+ features de la ultimul audit" din `CLAUDE.md`. Verificarea automată lunară a detectat deja asta și a deschis singură #149 pe 2026-07-04 ("Scheduled check: architecture audit may be due"). #143 e issue-ul concret pentru a face treaba, declanșat inițial de #99: fixarea `merchant_mappings` → AB Rules a atins 10 fișiere backend + 5 frontend într-o singură sesiune, și pe parcurs s-a găsit o euristică ("primul cuvânt din payee, dacă e specific") duplicată în 5-6 locuri (`client.py`'s `get_uncategorized_groups`, `actual_budget.py`'s `propose_categorize_with_rule`, `proposals.py`, plus 3 adăugate chiar în timpul #99) înainte de a fi extrasă într-un singur helper `rule_match_prefix()`. Exact triggerul deja documentat în `CLAUDE.md` ("extract at the second occurrence") — dar a ajuns la 5-6 înainte să prindă cineva, pentru că nimic nu scana proactiv pentru asta.

Sesiunea de azi (2026-07-05) a mai găsit ceva relevant pentru audit, deși nu e cod duplicat clasic: `BudgetChart.tsx` și `GoalsChart.tsx` (frontend) sunt aproape identice — ambele randare unei liste cu progress bar + procent + valoare/target, doar câmpuri și culori diferite. Merită verificat dacă mai există alte perechi de componente frontend la fel de apropiate.

## Ce trebuie verificat

1. **Sweep sistematic de logică duplicată** — grep pentru forme de cod repetate (nu doar duplicate exacte — logică aproape identică cu variabile redenumite) în `backend/api/`, `backend/tools/`, `backend/core/`, și **frontend/src/components/** (extins față de scope-ul original al #143, ca să prindă și cazul BudgetChart/GoalsChart). Orice logică prezentă în 2+ locuri trebuie extrasă într-o singură funcție/component, nu lăsată să se multiplice la a 3-a/4-a/5-a copie.
2. Re-verifică exact pattern-ul care a declanșat issue-ul: mai există alte helpere mici de tip "calculează X dintr-un string" sau "rezolvă Y după nume" duplicate inline în tool functions / API routers, la fel cum era `rule_match_prefix`?
3. Checklist-ul standard de audit din #93 rămâne valabil — cod mort, importuri neutilizate, lungimea descrierilor de tool-uri, consistența error handling-ului. Vezi `docs/decisions.md#93-code-audit` pentru exact ce s-a verificat/decis atunci (referință, nu duplică orbește — verifică ce s-a schimbat de atunci).

## De ce contează

Din `docs/decisions.md`'s intrare #93: logica duplicată deviază silențios (o copie primește un fix, celelalte nu) fără nicio eroare care să reveleze mismatch-ul. Prinderea la a 2-a apariție e ieftină; prinderea la a 5-a înseamnă audit ca să afli care din cele 5 e de fapt corectă.

## Protocol — nu uita

- **Nu începe direct să refactorizezi.** Auditul e întâi investigativ — găsește și listează, apoi prezintă userului ce-ai găsit (grupat pe severitate/impact), și abia după confirmare treci la fix-uri. Unele găsiri pot fi triviale (fix direct), altele pot cere o discuție de arhitectură (ex. dacă BudgetChart/GoalsChart chiar merită unificate acum sau rămân separate până la sesiunea #008 de charting generic — vezi mai jos, sunt legate).
- **Notă:** sesiunea #008 (charting generic, `008_134-generic-charting-system.md`) va atinge probabil aceleași `BudgetChart.tsx`/`GoalsChart.tsx` — dacă auditul ăsta rulează primul (recomandat), doar semnalează duplicarea găsită acolo, nu o rezolva — las-o pentru #008 ca să nu faci treaba de două ori sau să intri în conflict cu decizia de arhitectură care se ia acolo.
- Verifică `docs/architecture.md` regula 20 (helper-e comune de reutilizat, nu re-derivat) înainte de a propune extrageri noi.
- Testează live pe stack-ul local (`docker compose up -d --build majordom-api majordom-web` pentru schimbări backend; `docker compose build majordom-web && docker compose up -d majordom-web` pentru frontend) — ține minte corolarul regulii 19 din `architecture.md` (restart nu recitește `.env`, nici build nou de cod — trebuie `up -d`/`--build`).
- Protocol complet de final din `CLAUDE.md`: self-check reguli aplicate, commit (weekend = ora reală; weekday = 18-23), `gh issue close 143 -c "..."`, entry în `docs/sessions/` săptămâna curentă + rând în `INDEX.md`, actualizează `docs/decisions.md`/`architecture.md` dacă auditul produce decizii sau reguli noi.
