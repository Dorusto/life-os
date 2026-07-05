# Sesiunea următoare — #78: `setup_default_groups` — arată grupurile existente, permite redenumire

## Context

`setup_default_groups` (tool de chat) propune crearea celor 7 grupuri standard de categorii (Housing, Daily Living, Transport, Health, Lifestyle, Finance, Unexpected) + subcategoriile lor implicite. Azi funcționează corect ca "creează ce lipsește", dar cardul de confirmare arată **doar** grupurile care urmează să fie create — nu și cele deja existente, și nu oferă nicio cale de a redenumi un grup existent înainte de a rula setup-ul (ex. userul are deja "Food" și ar vrea să-l redenumească în "Daily Living" în loc să rămână cu ambele).

Nu e un bug — implementarea curentă creează corect ce lipsește. E o îmbunătățire de UX/interactivitate.

## Stare curentă (cercetat 2026-07-04, verifică înainte de a te baza pe ea)

**Backend:**
- `backend/tools/finance/actual_budget.py:883` — `setup_default_groups()`: listă hardcodată `_GROUPS` (7 grupuri + subcategorii), cere `client.get_category_groups()`, filtrează ce lipsește (`to_create`), stochează acțiunea, returnează un card cu `preview` (string concatenat) și `groups` (doar cele de creat).
- `backend/api/category_actions.py:48` — handler-ul de confirmare (`setup_groups`): iterează `action["groups"]`, apelează `client.create_category_group()` apoi `client.create_category()` per subcategorie, ignoră erorile individual (`except: pass` — deja tolerant la "există deja").
- `backend/core/actual_client/client.py:977` — `create_category_group(name)` există. `get_category_groups()` (linia 989) întoarce doar `list[str]` (nume) — **nu** obiecte cu id, deci nu poți deosebi ce grup e ce dacă vrei să-l redenumești direct.
- **Nu există `rename_category_group()`** — doar `rename_category()` (linia 1025, pentru categorii individuale, nu grupuri). Trebuie scrisă de la zero, dar e simplu: `CategoryGroups` are coloană `name` editabilă direct (verificat: `hidden, id, name, is_income, sort_order, tombstone`), același tipar ca `rename_category()` — caută grupul, setează `.name`, `commit()`. Problemă: **nu există un `get_category_group(session, name)` helper în `actualpy`** (verificat, `ImportError`) — trebuie interogat direct via `actual.session.query(CategoryGroups).filter(CategoryGroups.name == old_name, CategoryGroups.tombstone == 0).first()`, ca în alte metode din `client.py` care nu au un helper `actualpy` dedicat.

**Frontend:**
- `frontend/src/components/CategoryActionCard.tsx:50` — `isSetupGroups` e doar unul din multe flag-uri de acțiune pe un card generic, partajat cu alte 6+ tipuri de acțiuni (rename, delete, set_budget, categorize_with_rule, set_budget_carryover, bank_resync). Titlul cardului pentru setup_groups: "Create standard groups?" — restul UI-ului pentru acest caz specific nu l-am citit încă în detaliu, verifică cum arată corpul cardului (sub titlu) înainte de a-l extinde.

## IMPORTANT — nu porni implementarea direct

**Discută mai întâi cu userul — issue-ul însuși listează mai multe direcții posibile, nu e o singură soluție evidentă:**

1. **Cât de interactiv?** Issue-ul propune 3 lucruri separate — (a) arată ce există lângă ce s-ar crea, (b) permite maparea unui grup existent la unul standard (ex. "Food → Daily Living"), (c) opțiune de redenumire ca parte a fluxului. Astea pot fi 1 feature sau 3 — clarifică scope-ul exact cu userul înainte de a scrie cod. "Posibil: un singur card cu toate cele 7 grupuri + status" (exists / will create / rename from X) e menționat ca idee în issue, dar userul trebuie să confirme dacă asta e forma dorită, nu presupune.
2. **Redenumire = doar grup, sau și subcategoriile lui?** Dacă userul redenumește "Food" → "Daily Living", subcategoriile deja existente sub "Food" rămân sub noul nume automat (redenumirea grupului nu mută categoriile, doar schimbă eticheta grupului-părinte) — dar dacă userul se aștepta ca și *categoriile implicite* din `_GROUPS` (Groceries & Drinks, Clothing, Children) să fie adăugate ca subcategorii NOI sub grupul redenumit, asta e un pas separat, nu automat. Clarifică ce se așteaptă să se întâmple cu categoriile implicite când grupul deja există sub alt nume.
3. **`get_category_groups()` întoarce doar nume, nu obiecte cu id** — dacă vrei să afișezi/editezi grupuri individual pe card (nu doar text), probabil ai nevoie de o versiune care întoarce mai mult context (id, poate și lista de subcategorii existente sub el, ca userul să vadă ce ar migra). Discută dacă schimbi semnătura existentă (risc: verifică toți apelanții — doar `setup_default_groups` de acum, dar verifică din nou înainte) sau adaugi o metodă nouă separată.

## Pattern-uri existente de reutilizat

- `rename_category()` (`client.py:1025`) — tiparul exact de urmat pentru `rename_category_group()` (caută → verifică existență → `.name = new_name` → `commit()`).
- Cardul `CategoryActionCard.tsx` e deja un card multi-acțiune reutilizat pentru 7+ tipuri — dacă noul flux setup_groups devine mult mai complex vizual (listă interactivă de 7 grupuri, fiecare cu propriul dropdown/input), ia în calcul dacă tot mai are sens să rămână parte din cardul generic sau merită propriul component dedicat (discută cu userul, nu decide unilateral — vezi regula de arhitectură din `CLAUDE.md`).
- Regula cardurilor de confirmare: orice câmp trebuie editabil, nu text static — dacă adaugi un pas de "mapare grup existent → standard", trebuie să fie un dropdown/input real, nu doar afișare.

## Protocol — nu uita

- Prezintă planul (3-5 linii) și cere confirmare explicită înainte de a scrie cod.
- Verifică `docs/architecture.md` regula 6 (confirmation card, câmpuri editabile) și regula despre `ActualBudgetClient` nou → trebuie adăugat și în `FinanceProvider`/`actual_budget_provider.py` (gotcha #126, deja documentat în `CLAUDE.md`).
- Testează live pe stack-ul local (`docker compose up -d --build majordom-api majordom-web`, ține minte corolarul regulii 19 — restart și la `majordom-web`).
- Protocol complet de final din `CLAUDE.md`: self-check reguli aplicate, commit (weekend = ora reală; weekday = 18-23), `gh issue close 78 -c "..."`, entry în `docs/sessions/` săptămâna curentă + rând în `INDEX.md`.
