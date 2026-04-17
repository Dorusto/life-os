# Majordom — Roadmap

## Prioritate mare

### ✅ Implementate

- **Import CSV tranzacții bancare** — upload CSV, detecție format cu Ollama, profiluri salvate, deduplicare, refund-uri tratate corect
- **Categorii la import CSV** — `actual_budget_id` salvat în SQLite la import; confirmare/schimbare categorie în Telegram propagă automat în Actual Budget via `update_transaction_category(financial_id)`
- **Auto-categorizare inteligentă** — doar din `merchant_mappings` confirmate de user (`from_history`), nu din prag AI; merchant nou → întotdeauna întrebat cu sugestie
- **Câmpuri standardizate** — payee = merchant, notes = `[foto bon]` / `[/add manual]` / `[import CSV]`
- **Anti-duplicat universal** — bon foto + /add + CSV folosesc același hash SHA256(dată+merchant+sumă)
- **Selecție cont la bon foto** — dacă există mai multe conturi, botul întreabă înainte de a salva
- **12 categorii curate** — Alimente, Restaurante, Transport, Utilități, Sănătate, Îmbrăcăminte, Casă & Întreținere, Divertisment & Vacanță, Copii, Bani Personali, Investiții & Economii, Altele
- **Web UI (PWA) v2** — FastAPI backend + React frontend, autentificare JWT, flux bon foto în browser, grafic cheltuieli lunar

### 🔲 Urmează

#### Bottom navigation bar
Taburi Home / Import / Chat pentru navigare rapidă în PWA.

#### Chat AI assistant (web)
Pagină dedicată cu asistent financiar conversațional. Are acces la date reale (conturi, statistici, tranzacții). Poate răspunde la întrebări financiare și executa acțiuni (creare cont, adăugare cheltuială).

#### Mesaje interactive în chat (rich actions)
Echivalent butoane Telegram, dar mai bogat. AI include blocuri structurate în răspuns (ex: `<action type="category_select" options="..."/>`). Frontend-ul React parsează și randează componente interactive: butoane categorie, date picker, confirmare tranzacție. După acțiunea userului, rezultatul se trimite înapoi ca mesaj user.

Necesită:
1. Extindere `Message` interface cu câmp opțional `actions`
2. Parser pentru blocuri structurate din stream
3. Componente React per tip acțiune
4. Prompt Ollama actualizat să genereze blocuri structurate când e cazul

#### CSV import UI (web)
Pagină dedicată pentru upload și procesare CSV bancar. Portare wizard-ului din Telegram în interfața web.

#### Document Management System
Upload fișier (foto/PDF) → Ollama detectează tipul → user confirmă → extrage câmpuri specifice tipului → salvează în SQLite. Stocare fișiere originale: deferată (faza 2, când se decide storage local vs. encrypted DB).

**Flow UI:** buton upload → preview imagine/PDF → card cu tipul detectat de AI + câmpurile extrase → user confirmă sau corectează tipul → salvare.

**Tipuri de documente suportate:**

| Tip | Câmpuri extrase | Acțiune după salvare |
|-----|-----------------|----------------------|
| `receipt` | merchant, sumă, dată, TVA | tranzacție în Actual Budget |
| `invoice` | merchant, sumă, dată, număr factură, scadență | tranzacție în Actual Budget |
| `vehicle_document` | VIN, număr înmatriculare, marcă, model, an, dată primă înmatriculare, dată transfer | populează profil vehicul |
| `vehicle_insurance` | companie, număr poliță, dată start, dată expirare, valoare primă | reminder reînnoire RCA/asigurare |
| `vehicle_inspection` | dată efectuare, dată expirare, km la inspecție | reminder scadență ITP/APK |
| `warranty` | produs, număr serie, dată cumpărare, dată expirare garanție, merchant | reminder expirare garanție |
| `insurance_policy` | tip (casă/sănătate), companie, număr poliță, dată expirare | reminder reînnoire |
| `medical` | dată, doctor, rezumat (fără date medicale în clar) | arhivat fără acțiune financiară |
| `contract` | tip, părți, obiect, dată start, dată expirare | reminder expirare |
| `other` | titlu, dată, sumă (dacă există) | arhivat |

**Notă securitate:** Majordom self-hosted este mai sigur decât Google Drive pentru documente sensibile (tenaamstellingsverslag, polițe de asigurare). Datele rămân local, fără cloud terț.

**Schema SQLite `documents`:**
```sql
CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    doc_type TEXT,           -- receipt, invoice, vehicle_document, etc.
    detected_type TEXT,      -- ce a detectat AI (înainte de confirmare user)
    title TEXT,
    date TEXT,
    amount REAL,
    currency TEXT DEFAULT 'EUR',
    extracted_data TEXT,     -- JSON cu toate câmpurile specifice tipului
    vehicle_id INTEGER,      -- FK dacă e document de vehicul
    financial_id TEXT,       -- actual_budget transaction id dacă s-a creat
    file_path TEXT,          -- NULL până la implementarea stocării fișierelor
    created_at TEXT DEFAULT (datetime('now')),
    notes TEXT
);
```

#### Profil financiar per user (onboarding)
Fiecare utilizator își construiește profilul prin conversație cu Majordom (venituri, cheltuieli fixe, obiective). Se reflectă ca bugete în Actual Budget. Nu este pre-configurat.

#### README de instalare
Ghid pas cu pas: Docker, Telegram bot token, Actual Budget, configurare `.env`, primul start.

#### Sincronizare automată bancă
GoCardless/Nordigen (open banking NL) — **on hold**: accesul pentru dezvoltatori individuali în UE este restricționat; de urmărit evoluția reglementărilor PSD2/PSD3.

---

## Prioritate medie

#### FIRE calculator
Calcul independență financiară bazat pe profilul utilizatorului: rata de economisire curentă, portofoliu, vârstă țintă retragere, regula 4%.

#### Obiective de economisire (savings goals)
Urmărire progres: fond urgență, vacanță, achiziții mari. Vizualizare progres în dashboard.

#### Bugete lunare în Actual Budget
Configurare limite per categorie (feature nativ Actual Budget).

#### Sistem notificări extensibil
Arhitectură generică bazată pe `notification_rules` (SQLite, config JSON per tip) + `notification_log` (anti-spam). Scheduler APScheduler în FastAPI rulează zilnic 08:00. Livrare prin Telegram (existent) + Web Push (PWA).

Tipuri de reguli:
- `budget_alert` — declanșat după fiecare tranzacție nouă și zilnic; alertă când o categorie depășește X% din limita lunară configurată
- `goal_risk` — check săptămânal; calculează dacă ritmul de contribuție curent atinge ținta (fond urgență, obiective economii) la timp; alertă dacă data țintă riscă să fie amânată
- `vehicle_reminder` — check zilnic; două subtipuri: pe dată (ITP/APK, revizie scadentă, cu X zile înainte) și pe km (schimb ulei la fiecare N km, bazat pe `vehicle_log`)

Livrare: **Web Push primar** (PWA), Telegram secundar/fallback.

#### Vehicle Management — înlocuitor complet Fuelio
**Scop:** înlocuiește Fuelio complet, inclusiv import istoric existent.

**Vehicule existente:**
- Mașină — achiziționată aprilie 2026
- Motocicletă Suzuki VZ 800 (2006), număr înmatriculare `50 MN-VJ`, alias "Suzi" / "Wabi Sabi" — istoric din 2023 în Fuelio

**Schema SQLite:**
```sql
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,               -- "Suzi", "Mașina"
    make TEXT,               -- "Suzuki", "..."
    model TEXT,              -- "VZ 800"
    year INTEGER,
    vin TEXT,
    plate TEXT,              -- "50 MN-VJ"
    fuel_type TEXT,          -- "petrol", "diesel", "electric"
    tank_capacity REAL,      -- litri
    km_initial INTEGER,      -- km la momentul adăugării în Majordom
    apk_due TEXT,            -- dată scadență APK/ITP (YYYY-MM-DD)
    insurance_due TEXT,      -- dată scadență RCA
    active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE vehicle_log (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER REFERENCES vehicles(id),
    date TEXT,               -- YYYY-MM-DD HH:MM
    odo_km REAL,             -- km bord la momentul înregistrării
    entry_type TEXT,         -- "fuel", "service", "maintenance", "inspection", "insurance", "other"
    -- câmpuri pentru fuel:
    fuel_liters REAL,
    fuel_price_per_liter REAL,
    fuel_full_tank INTEGER,  -- 1 = plin complet, 0 = parțial
    fuel_missed INTEGER,     -- 1 = a mai alimentat între timp (exclude din calcul consum)
    -- câmpuri pentru cost:
    cost_total REAL,
    cost_currency TEXT DEFAULT 'EUR',
    -- câmpuri pentru reminder:
    remind_odo REAL,         -- km la care se trimite reminder (ex: odo+15000)
    remind_date TEXT,        -- dată la care se trimite reminder
    repeat_odo REAL,         -- interval km pentru reminder recurent
    repeat_months INTEGER,   -- interval luni pentru reminder recurent
    -- general:
    location TEXT,           -- "Oostzaan - Esso" (opțional, din bon sau GPS)
    notes TEXT,
    financial_id TEXT,       -- actual_budget transaction id (dacă s-a înregistrat cheltuiala)
    source TEXT,             -- "manual", "photo", "fuelio_import"
    fuelio_unique_id TEXT,   -- id original din Fuelio (pentru deduplicare la import)
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Import istoric Fuelio:**

Format CSV Fuelio (din `sync/vehicle-N-sync.csv`) are 4 secțiuni:
```
## Vehicle     → profil vehicul
## Log         → alimentări (Data, Odo, Fuel litres, Full, Price, l/100km, City, Missed)
## CostCategories → tipuri cheltuieli (Service=1, Maintenance=2, Insurance=31, etc.)
## Costs       → cheltuieli extra (titlu, dată, Odo, CostTypeID, Cost, RemindOdo, RemindDate, RepeatOdo, RepeatMonths)
```

Mapare `CostTypeID` → `entry_type`:
- 1 (Service) → `service`
- 2 (Maintenance) → `maintenance`
- 4 (Registration) → `other`
- 5 (Parking) → `other`
- 31 (Insurance) → `insurance`

Import pune `source = "fuelio_import"` și `fuelio_unique_id` pentru a preveni duplicate la re-import.

**Calcule automate:**
- L/100km per alimentare: `(litri / (odo_curent - odo_anterior)) * 100` — doar dacă `full_tank=1` și `missed=0`
- Cost per km: `cost_total / (odo_curent - odo_anterior)`
- Medie mobilă consum: ultimele 5 alimentări valide

**Grafice în PWA (Recharts):**
- Fuel consumption over time — L/100km per alimentare + linie medie mobilă
- Monthly costs — combustibil + alte costuri per lună, stacked bar; filtru per tip cost
- Monthly distance — km parcurși per lună
- Cost per km — evoluție în timp (EUR/km total și doar combustibil)

**Stats dashboard per vehicul:**
- Fill-ups this year / this month vs. an/lună anterioară
- Total litri this year / this month
- Average consumption / best / worst L/100km
- Average cost per km (fuel only + total)

**Flow înregistrare alimentare din poze:**
1. User uploadează poza bonului benzinărie → Ollama extrage: litri, preț/litru, total, locație (dacă e pe bon)
2. User uploadează poza bordului → Ollama extrage: ODO km
3. User selectează vehiculul (dacă are mai multe)
4. User confirmă datele extrase → salvare în `vehicle_log` + tranzacție în Actual Budget categoria `transport`

**Remindere (integrate cu sistemul de notificări):**
- APK/ITP anual — 30 zile înainte de `apk_due`
- RCA reînnoire — 30 zile înainte de `insurance_due`
- Service/revizie — când `odo_curent >= remind_odo` SAU cu 7 zile înainte de `remind_date`
- Calculul `remind_odo` la salvare: `odo_curent + repeat_odo` (dacă `repeat_odo > 0`)

**Calcule conversaționale prin AI chat** (nu calculator dedicat):
- "Cât mă costă un drum la Galați?" → AI folosește consum mediu + distanță + preț combustibil curent
- "Când trebuie să schimb uleiul?" → AI verifică ultimul service + km actuali
- "Care e costul lunar al motocicletei?" → AI agregă din vehicle_log

#### Monitorizare investiții
Integrare cu [Ghostfolio](https://ghostfol.io) (self-hosted, open source) pentru urmărire portofoliu ETF.

#### Dashboard venituri freelance
ZZP (Olanda) pentru clipuri YouTube/activitate plătită. Cheltuieli deductibile separate.

---

## Prioritate mică

- **GPU inference Ollama** — momentan CPU (~60s/imagine); de revizitat cu modele mai mici sau optimizări quantization
- **Suport RON** — tranzacții din România (apartament Galați, vizite)
- **Raport lunar automat** — summary trimis pe Telegram/web la 1 ale lunii
- **Setup wizard prin Telegram** — comandă `/setup` care ghidează utilizatorul nou: creează primul cont, configurează categoriile preferate, testează conexiunea cu Actual Budget

---

## Post-MVP — Lansare & Creștere

- **Monetizare** — definește modelul înainte de orice promovare (hosted SaaS cu tier gratuit? donații/sponsorizări open source? one-time fee pentru setup managed?)
- **Feedback consultant financiar** — găsește un consultant financiar (NL sau RO) dispus să testeze Majordom și să ofere feedback structurat; potențial parteneriat dacă există sinergie
- **Review creator de conținut** — după ce monetizarea e pusă la punct, contactează un creator de conținut din nișa finanțe personale (YouTube/blog) pentru review onest
