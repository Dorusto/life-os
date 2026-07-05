# Sesiunea următoare — #134: sistem generic de grafice + grafice vehicul (consum/cost/istoric)

## Context

#134 cerea inițial "grafice vizuale pentru istoricul de vehicul (consum, cost per plin, distanță între alimentări), stil Fuelio" — dar discuția din 2026-07-05 a dus la o întrebare mai mare: de ce construim un tool + un component React noi de la zero pentru fiecare tip de grafic cerut, când datele oricum există și un singur sistem generic (dă-i JSON cu tipul de grafic + datele, el randează) ar putea servi orice cerere viitoare?

Dovadă concretă că merită generalizat acum, nu mai târziu: `frontend/src/components/BudgetChart.tsx` și `GoalsChart.tsx` sunt deja aproape identice — ambele randare unei liste cu progress bar orizontal + procent + valoare/target, doar câmpuri și praguri de culoare diferite. Asta e exact pragul "extract at the second occurrence" din `CLAUDE.md` — deja depășit, și un al cincilea component bespoke (fuel chart) l-ar fi agravat.

## Inventar — ce există azi (verificat 2026-07-05, verifică din nou înainte de a te baza pe el)

**Backend** (`backend/tools/finance/actual_budget.py`):
- `get_spending_chart()` (linia 337) — date pentru donut/pie
- `get_budget_chart()` (linia 362) — date pentru listă progress-bar
- `get_spending_trend()` (linia 390) — date pentru bar chart grupat (2 serii: spending vs income)
- `get_goals_chart()` (linia 418) — date pentru listă progress-bar (a doua variantă, aproape identică cu budget_chart)

**Frontend** (`frontend/src/components/`):
- `SpendingChart.tsx` (179 linii) — donut SVG pur (stroke-dasharray), fără librărie externă
- `BudgetChart.tsx` (89 linii) — listă cu progress bar orizontal
- `GoalsChart.tsx` (81 linii) — listă cu progress bar orizontal (aproape duplicat cu BudgetChart)
- `TrendChart.tsx` (92 linii) — bar chart grupat, 2 serii, scalare pe max global

**Mecanism de randare:** toate 4 tool-urile sunt în `_PROPOSAL_TOOLS` (`backend/api/chat.py:151`) — nu pentru că ar necesita confirmare (sunt read-only), ci pentru că lista aia declanșează randare specială în frontend (raw JSON trece direct către componenta potrivită după câmpul `"type"`, nu prin text LLM). Orice tool nou de grafic trebuie adăugat acolo la fel.

**Decizie existentă de suprascris:** `docs/decisions.md`, intrarea "Charts inline in chat (issue #30)" zice explicit "Pure SVG/div for current chart types. **One tool per chart type.** No external library." — sistemul generic propus inversează exact "one tool per chart type". `docs/decisions.md` e append-only/ADR-style (regulă din 2026-07-04) — **nu edita acea intrare**, adaugă una nouă cu `**Superseded by:** [nume intrare nouă]` la vechea intrare.

## Ce lipsește complet

Un **line chart** (tendință în timp, ex. consum L/100km pe ultimele alimentări) — nicio componentă existentă nu face asta. Bar chart-ul din `TrendChart` e cel mai apropiat, dar barele discrete nu sunt totuna cu o linie continuă de tendință.

## IMPORTANT — nu porni implementarea direct

**Discută arhitectura cu userul înainte de orice cod — nu e o singură soluție evidentă:**

1. **Forma contractului JSON generic** — cel puțin 4 tipuri de bază: `pie`/`donut`, `bar` (single sau grupat), `line`, `progress_list`. Propune un discriminator (`{"type": "chart", "chart_type": "pie" | "bar" | "line" | "progress_list", "data": {...}}`) și clarifică ce câmpuri comune vs. specifice per tip are `data`.
2. **Migrăm cele 4 grafice existente la noul sistem, sau construim sistemul generic doar pentru cazuri noi (vehicul) și lăsăm cele vechi neatinse?** Migrarea completă elimină duplicarea reală (BudgetChart/GoalsChart), dar e mai mult risc/timp (4 tool-uri + 4 componente de retestat). Prezintă trade-off-ul, nu decide unilateral.
3. **Cine alege tipul de grafic — LLM-ul sau tool-ul?** Recomandare de discutat: tool-ul (cod determinist) decide tipul potrivit pentru cererea lui specifică și populează contractul generic; LLM-ul nu alege liber tipul de grafic (risc: poate alege un tip nepotrivit pentru forma datelor). Dar confirmă cu userul înainte de a alege definitiv.
4. **Grafice vehicul concrete de construit peste noul sistem** (din #134 + discuția de azi): consum în timp (line), cost per alimentare + cumulat (bar), posibil istoric/distanță între alimentări. Clarifică exact ce iese în M1 al feature-ului — nu construi toate deodată dacă nu-i nevoie.

## Pattern-uri existente de reutilizat

- `SpendingChart.tsx` — tehnica SVG donut (stroke-dasharray/dashoffset), utilă dacă rămâne un tip separat.
- `TrendChart.tsx` — scalare pe max global (`scaleHeight`), utilă ca bază pentru orice bar/line chart generic.
- Culorile `SEGMENT_COLORS` sunt deja partajate (comentariu în `BudgetChart.tsx`: "Colors from SpendingChart") — orice sistem generic ar trebui să centralizeze paleta o singură dată, nu s-o mai copieze.
- `get_vehicle_log`/`get_vehicle_stats` (`backend/tools/finance/vehicle.py`) deja întorc istoricul de alimentare și statisticile de consum ca text — sursa de date pentru noile grafice, nu trebuie re-derivată.

## Legătură cu #143 (audit, sesiunea anterioară în ordine)

Dacă #143 a rulat deja și a semnalat duplicarea BudgetChart/GoalsChart fără s-o rezolve (așa cum instruiește promptul lui), tratarea ei e parte din decizia #2 de mai sus, nu un task separat.

## Protocol — nu uita

- Prezintă planul de arhitectură (trade-off-urile de mai sus) în 2-3 linii per punct, cere confirmare explicită înainte de a scrie cod.
- Regula cardurilor: aceste tool-uri sunt read-only (afișare, nu confirmare) — nu le trata ca proposal cards cu câmpuri editabile, doar afișare.
- Testează live pe stack-ul local (`docker compose build majordom-web && docker compose up -d majordom-web`, plus `--build majordom-api` dacă schimbi backend) — corolarul regulii 19 din `architecture.md`.
- Adaugă o intrare nouă în `docs/decisions.md` (nu edita "Charts inline in chat") care documentează decizia de sistem generic și marchează vechea intrare ca superseded.
- Protocol complet de final din `CLAUDE.md`: self-check reguli aplicate, commit (weekend = ora reală; weekday = 18-23), `gh issue close 134 -c "..."`, entry în `docs/sessions/` săptămâna curentă + rând în `INDEX.md`, actualizează `docs/roadmap.md` dacă e item de milestone.
