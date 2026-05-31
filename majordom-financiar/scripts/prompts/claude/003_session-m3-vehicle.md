# Session start — M3 Vehicle Management (issue #34, #35, #36, #37)

## Ce s-a terminat înainte de această sesiune

- ✅ M0, M1, Pre-M2, M2-NEW — toate complete
- ✅ M2.5 — de implementat (nu blochează M3)
- ✅ Category groups, confirmation cards, savings goals cu deadline
- ✅ ROADMAP restructurat — M3 e next milestone

## Obiectivul acestei sesiuni

**Implementare completă M3 — Vehicle Management**

Scopul principal: importul istoricului din Fuelio + înregistrare manuală de alimentări. Totul prin chat, fără UI dedicat în faza 1.

---

## Fișierele de test Fuelio

Locație: `tests/Fuelio/sync/`

### vehicle-2-sync.csv — KIA Ceed 2008
- **1299 rânduri** — istoricul mașinii (alimentări + costuri)
- Tip combustibil: FuelType `111` = benzină

### vehicle-3-sync.csv — Suzuki VZ 800 2006 (motocicletă)
- **128 rânduri**
- Tip combustibil: FuelType `110` = benzină

### Format CSV Fuelio (sync export)

```
"## Vehicle"
"Name","Description","DistUnit","FuelUnit","ConsumptionUnit","ImportCSVDateFormat","VIN","Insurance","Plate","Make","Model","Year","TankCount","Tank1Type","Tank2Type","Active","Tank1Capacity","Tank2Capacity",...

"## Log"
"Data","Odo (km)","Fuel (litres)","Full","Price (optional)","l/100km (optional)","latitude (optional)","longitude (optional)","City (optional)","Notes (optional)","Missed","TankNumber","FuelType","VolumePrice","StationID (optional)","ExcludeDistance","UniqueId",...

"## CostCategories"
"CostTypeID","Name","priority","color",...

"## Costs"
"CostTitle","Date","Odo","CostTypeID","Notes","Cost","flag","idR","read","RemindOdo","RemindDate","isTemplate","RepeatOdo","RepeatMonths","isIncome","UniqueId",...
```

### Gotcha-uri observate în fișierele reale

1. **Coloana dată se numește "Data"** (nu "Date") — versiunea română a Fuelio
2. **UniqueId este integer** (nu UUID) — folosit pentru deduplicare pe re-import
3. **FuelType codes**: 100, 110, 111 = benzină (diferite versiuni Fuelio); nu contează valoarea exactă pentru noi
4. **Price = total plătit** (nu preț/litru) — `VolumePrice` = preț per litru
5. **Full=0** = alimentare parțială → exclude din calculul consumului
6. **Missed=1** → a alimentat între timp fără să înregistreze → exclude din consum
7. **Costuri cu Cost=0.0** = reminder fără sumă (ex: ITP, RCA) — păstrate ca remindere, nu ca tranzacții financiare
8. **RemindOdo/RemindDate/RepeatOdo/RepeatMonths** în Costs → remindere periodice (revizie la X km, RCA anual)
9. **CostCategories** variază per vehicle (nu toate au aceleași tipuri)
10. **Routes folder** există dar nu e relevant pentru import (trasee GPS)

### CostTypeID → entry_type mapping

| CostTypeID | Fuelio Name | entry_type |
|------------|-------------|------------|
| 1 | Service | `service` |
| 2 | Maintenance | `maintenance` |
| 4 | Registration | `other` |
| 5 | Parking | `other` |
| 6 | Wash | `other` |
| 7 | Tolls | `other` |
| 8 | Tickets/Fines | `other` |
| 9 | Tuning | `maintenance` |
| 31 | Insurance | `insurance` |

---

## Arhitectura deciză (din ROADMAP)

```
AB (Actual Budget) = costuri financiare (tranzacții în categoria Transport)
SQLite vehicle_log = date operaționale (odometru, litri, consum)
```

Când userul înregistrează o alimentare:
- `propose_transaction` → AB (suma în €, categoria Transport)
- INSERT → `vehicle_log` (litri, ODO, consum calculat)

Întrebări financiare → AB. Întrebări operaționale → SQLite.

---

## Schema SQLite (din ROADMAP — implementează exact)

```sql
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    make TEXT,
    model TEXT,
    year INTEGER,
    vin TEXT,
    plate TEXT,
    fuel_type TEXT,          -- "petrol", "diesel", "electric"
    tank_capacity REAL,
    km_initial INTEGER,
    apk_due TEXT,            -- YYYY-MM-DD
    insurance_due TEXT,
    active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE vehicle_log (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER REFERENCES vehicles(id),
    date TEXT,               -- YYYY-MM-DD HH:MM
    odo_km REAL,
    entry_type TEXT,         -- "fuel", "service", "maintenance", "inspection", "insurance", "other"
    fuel_liters REAL,
    fuel_price_per_liter REAL,
    fuel_full_tank INTEGER,
    fuel_missed INTEGER,
    cost_total REAL,
    cost_currency TEXT DEFAULT 'EUR',
    remind_odo REAL,
    remind_date TEXT,
    repeat_odo REAL,
    repeat_months INTEGER,
    location TEXT,
    notes TEXT,
    financial_id TEXT,       -- AB transaction id
    source TEXT,             -- "manual", "photo", "fuelio_import"
    fuelio_unique_id TEXT,   -- pentru deduplicare re-import
    created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Pașii de implementare (în ordine)

### Pasul 1 — SQLite schema (3.1)

Adaugă `vehicles` și `vehicle_log` în `backend/core/memory/database.py` (lângă tabelele existente `merchant_mappings`, `pending_review` etc.).

Inițializare la startup în `_create_tables()` — aceeași funcție care creează celelalte tabele.

### Pasul 2 — Fuelio CSV import endpoint (3.2)

`POST /api/import/fuelio` — multipart upload, un fișier `sync/vehicle-N-sync.csv`.

**Parser logic:**
1. Citește fișierul linie cu linie
2. Detectează secțiunea curentă (`## Vehicle`, `## Log`, `## CostCategories`, `## Costs`)
3. Parsează header-ul CSV per secțiune (primul rând după `## Section`)
4. Parsează datele

**Vehicle section → `vehicles` table:**
- `Name` → `name`
- `Make` → `make`, `Model` → `model`, `Year` → `year`
- `Plate` → `plate`, `Tank1Capacity` → `tank_capacity`
- Dacă vehiculul (by name+plate) există deja → update, nu duplicate
- `source = "fuelio_import"`

**Log section → `vehicle_log` table:**
- `Data` → `date` (format: `yyyy-MM-dd HH:mm`)
- `Odo (km)` → `odo_km`
- `Fuel (litres)` → `fuel_liters`
- `Full` → `fuel_full_tank` (1/0)
- `Price (optional)` → `cost_total` (total plătit, nu preț/litru)
- `VolumePrice` → `fuel_price_per_liter`
- `City (optional)` → `location`
- `Missed` → `fuel_missed`
- `UniqueId` → `fuelio_unique_id` (INTEGER ca string pentru deduplicare)
- `entry_type = "fuel"`
- `source = "fuelio_import"`
- Deduplicare: `INSERT OR IGNORE` pe `(vehicle_id, fuelio_unique_id)`

**Costs section → `vehicle_log` table:**
- `CostTitle` → `notes`
- `Date` → `date`
- `Odo` → `odo_km`
- `CostTypeID` → `entry_type` (via mapping de mai sus)
- `Cost` → `cost_total`
- `RemindOdo` → `remind_odo` (0 = fără reminder)
- `RemindDate` → `remind_date` (`2011-01-01` = placeholder Fuelio = NULL)
- `RepeatOdo` → `repeat_odo`
- `RepeatMonths` → `repeat_months`
- `UniqueId` → `fuelio_unique_id`
- Deduplicare: `INSERT OR IGNORE` pe `(vehicle_id, fuelio_unique_id, entry_type)`
- Costuri cu `Cost > 0` → și tranzacție în AB (categoria Transport) via `propose_transaction`

**Response:**
```json
{
  "vehicle_name": "kia",
  "fuel_entries": 88,
  "cost_entries": 12,
  "skipped_duplicates": 0,
  "ab_transactions_to_confirm": [...]  // costuri > 0 propuse pentru AB
}
```

### Pasul 3 — Import card în chat (frontend)

Pattern identic cu `CsvImportCard`:
- Upload CSV din chat (butonul `+`)
- Backend detectează că e Fuelio (header `"## Vehicle"`) și rutează la `/api/import/fuelio`
- Returnează summary card: "Imported 88 refuels + 12 costs for KIA Ceed"
- Dacă sunt costuri > 0 → arată lista cu ProposalCard pentru fiecare tranzacție AB

### Pasul 4 — Chat tools pentru vehicle (3.1 parțial)

Tool `log_refuel(vehicle_name, liters, total_eur, odo_km, location, full_tank)`:
- Confirmation card (regula obligatorie)
- La confirmare: INSERT în `vehicle_log` + `propose_transaction` în AB

Tool `get_vehicle_stats(vehicle_name, period)`:
- Query pe `vehicle_log` → consum mediu, cost/km, total cheltuieli
- Răspuns text în chat

---

## Fișiere cheie de citit la start sesiune

1. `ARCHITECTURE.md`, `ROADMAP.md` (secțiunea M3)
2. `backend/core/memory/database.py` — structura existentă SQLite
3. `backend/api/csv_import.py` — model de urmat pentru import flow
4. `tests/Fuelio/sync/vehicle-2-sync.csv` și `vehicle-3-sync.csv`
5. `backend/tools/registry.py` — pentru adăugat tool-urile noi

## Înainte de cod

1. Citește fișierele de mai sus
2. Rulează `gh issue list` — issues relevante: #34, #35, #36, #37
3. Verifică `backend/core/memory/database.py` — unde se adaugă schema nouă
4. Implementează în ordinea pașilor 1 → 2 → 3 → 4
