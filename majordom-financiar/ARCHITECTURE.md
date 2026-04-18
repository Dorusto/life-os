# Majordom — Architecture & Developer Guide

> Source of truth pentru orice agent AI sau developer care lucrează la acest proiect.
> Citește acest fișier înainte de orice modificare.

---

## Ce face aplicația

Majordom este o interfață conversațională peste Actual Budget — nu o aplicație financiară de sine stătătoare. Utilizatorul interacționează prin chat (web PWA sau Telegram), iar Majordom execută acțiunile în Actual Budget prin API.

**Principii fundamentale:**
- Zero date financiare în cloud. Totul rulează pe serverul propriu.
- Majordom nu reinventează nimic din ce face Actual Budget. Dacă AB are un tool pentru ceva, Majordom îl folosește pe acela.
- SQLite-ul local există doar pentru context conversațional și preferințe utilizator — nu pentru date financiare.

---

## Principiu arhitectural

| Responsabilitate | Unde trăiește |
|-----------------|---------------|
| Tranzacții, conturi, solduri | **Actual Budget** |
| Categorii, grupuri, bugete | **Actual Budget** |
| Obiective, schedule-uri, reguli, transferuri | **Actual Budget** |
| Rapoarte, net worth, cash flow | **Actual Budget** |
| Preferințe utilizator, stare onboarding | **SQLite (Majordom)** |
| Istoric conversații | **SQLite (Majordom)** |
| Mapări merchant→categorie (până la sync în AB rules) | **SQLite (Majordom) — temporar** |

---

## Strategie platformă

- **Web PWA** — interfața principală; toate feature-urile noi se implementează aici
- **Telegram bot** — maintenance mode; nu se mai adaugă features noi; păstrat funcțional ca fallback și canal notificări

---

## Stack tehnic

| Componentă | Tehnologie | Note |
|---|---|---|
| Web frontend | React + TypeScript | PWA instalabilă |
| Web backend | FastAPI (Python 3.11) | REST API + WebSocket pentru chat |
| Bot Telegram | python-telegram-bot 21.6 | async, maintenance mode |
| AI vision / chat | Ollama + qwen2.5vl:3b | local, GPU RTX 4070 Mobile |
| Speech-to-text | Whisper (via Ollama) | planificat — voice input PWA |
| Budget app | Actual Budget | self-hosted Docker |
| Actual client | actualpy | Python wrapper peste AB API |
| Memorie/context | SQLite | via sqlite3 stdlib |
| Deploy | Docker Compose | 3 servicii: actual-budget, ollama, majordom |

---

## Structura proiectului

```
majordom-financiar/
├── frontend/                ← React PWA
│   ├── src/
│   │   ├── pages/           ← Home, Chat, Import, Documents
│   │   ├── components/      ← componente refolosibile
│   │   └── api/             ← apeluri către FastAPI backend
│   └── public/
│       └── manifest.json    ← PWA manifest
│
├── backend/                 ← FastAPI
│   ├── main.py              ← Entry point FastAPI, rute principale
│   ├── auth.py              ← JWT authentication
│   ├── chat.py              ← Chat endpoint, integrare Ollama
│   ├── actual_client/
│   │   └── client.py        ← Async wrapper peste actualpy:
│   │                            add_transaction(), get_accounts(),
│   │                            get_categories(), set_budget_amount()
│   ├── ocr/
│   │   ├── vision_engine.py ← Trimite poza la Ollama, primește JSON
│   │   └── parser.py        ← Dataclasses: ReceiptData, ReceiptItem
│   ├── csv_importer/
│   │   ├── profiles.py      ← CsvProfile, NormalizedTransaction
│   │   ├── normalizer.py    ← CSV bytes → NormalizedTransaction[]
│   │   └── detector.py      ← Detecție format: header signature + Ollama
│   ├── memory/
│   │   ├── database.py      ← SQLite: merchant_mappings, csv_profiles, etc.
│   │   └── categorizer.py   ← Sugestii categorie din istoricul confirmat
│   └── config/
│       └── settings.py      ← Singleton Settings din .env
│
├── bot/                     ← Telegram (maintenance mode)
│   ├── main.py              ← Entry point Telegram bot
│   ├── handlers.py          ← Comenzi și fluxuri
│   ├── keyboards.py         ← InlineKeyboardMarkup
│   └── csv_wizard.py        ← Import CSV via Telegram
│
├── docker-compose.yml       ← 3 servicii: actual-budget, ollama, majordom
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## Cum lucrăm la cod

Aceste reguli se aplică în orice sesiune de implementare:

**Înainte de orice cod:** se explică în română ce urmează să se facă, ce fișiere se vor atinge și care e rezultatul așteptat. Dacă nu e clar, se clarifică înainte de a scrie ceva.

**Un singur feature la un timp.** Nu se implementează două lucruri simultan.

**Funcții scurte cu nume clare.** `get_accounts_from_actual()` în loc de `fetch()`. Dacă o funcție face mai mult de un lucru, se sparge în două.

**Un fișier = un subiect.** `accounts.py` conține tot ce ține de conturi. Fișierele rămân mici și focalizate.

**Test după fiecare feature.** Testăm împreună că funcționează, apoi facem commit. Git este plasa de siguranță — orice commit funcțional e un punct de întoarcere.

**Când ceva se strică:** erorile au o locație. Comenzi utile:
```bash
docker logs majordom-bot          # erorile din backend/bot
docker logs majordom-frontend     # erorile din frontend (dacă sunt)
docker compose ps                 # status servicii
```

---

## Fluxul principal — procesare bon foto (web)

```
User încarcă poza în browser (PWA)
        │
frontend → POST /api/receipt (multipart)
        │
backend/chat.py sau receipt endpoint
        │
        ├── 1. VisionEngine.extract_from_bytes()
        │       └── resize la 512px (Pillow)
        │       └── encode base64
        │       └── POST la Ollama /api/chat cu imaginea
        │       └── parsează JSON → ReceiptData
        │
        ├── 2. SmartCategorizer.suggest()
        │       └── caută în merchant_mappings (SQLite)
        │       └── returnează categoria confirmată anterior
        │
        ├── 3. Dacă există mai multe conturi → întreabă userul care cont
        │
        └── 4. La confirmare: ActualBudgetClient.add_transaction()
                └── actualpy în ThreadPoolExecutor
                └── download_budget() → create_transaction() → commit()
```

---

## Fluxul CSV — import tranzacții bancare

```
User încarcă fișier CSV/OFX în browser
        │
frontend → POST /api/import/csv
        │
        ├── 1. CsvNormalizer.parse_csv(bytes)
        │       └── detectează encoding și delimiter
        │       └── returnează headers + rows
        │
        ├── 2. CsvProfileDetector.header_signature(headers)
        │       └── MD5 pe coloanele sortate → fingerprint
        │
        ├── 3a. Profil găsit în SQLite → aplică direct
        ├── 3b. Profil negăsit → Ollama detectează → user confirmă → salvat
        │
        ├── 4. Selecție cont destinație
        │
        ├── 5. Detectare perechi transfer (sumă egală, semn opus, ±3 zile)
        │       └── prezintă userului pentru confirmare
        │
        └── 6. La confirmare: ActualBudgetClient.add_transactions_batch()
                └── SHA256(data+merchant+suma) → deduplicare
                └── transferurile confirmate → create_transfer()
                └── restul → create_transaction() cu categorie auto
                └── un singur actual.commit() la final
```

---

## Module critice — ce să NU strici

### 1. Async vs Sync — CRITIC
Tot backend-ul este **async** (FastAPI + asyncio).
`ActualBudgetClient` rulează codul sync (`actualpy`) într-un `ThreadPoolExecutor`.

```python
# CORECT — sync în executor
async def get_accounts(self) -> list[Account]:
    def _get():
        with self._get_actual() as actual:
            actual.download_budget()
            return actual.get_accounts()
    return await self._run(_get)

# GREȘIT — blochează tot event loop-ul:
async def get_accounts(self):
    with self._get_actual() as actual:  # sync în async!
        ...
```

### 2. actualpy — ordinea operațiilor e obligatorie
```python
with self._get_actual() as actual:
    actual.download_budget()   # întâi download
    # ... operații ...
    actual.commit()            # la final pentru orice scriere
```

### 3. actualpy — naming quirk
Parametrul `imported_id` din `create_transaction()` se salvează intern ca `financial_id`.
Când citești tranzacții existente pentru deduplicare, folosești `tx.financial_id`:
```python
existing_ids = {tx.financial_id for tx in existing_txs if tx.financial_id}
```

### 4. Config — totul vine din settings
```python
# CORECT:
from config import settings
url = settings.ollama.url

# GREȘIT:
import os
url = os.getenv("OLLAMA_URL")  # niciodată direct în module
```

### 5. Deduplicare tranzacții
Toate tranzacțiile primesc un ID determinist: `SHA256(data + merchant + suma)[:16]`.
Dacă același ID există deja în Actual Budget, tranzacția se sare (nu se creează duplicat).

### 6. Rebuild Docker după modificări de cod
`docker compose restart majordom` NU aplică modificările — doar repornește containerul vechi.
```bash
docker compose build majordom && docker compose up -d majordom
```

### 7. Transferuri între conturi
Un transfer ING → Revolut apare în CSV-ul ING ca cheltuială. Trebuie detectat și înregistrat
ca transfer în Actual Budget, nu ca două tranzacții separate. Logica de detectare:
sumă egală, semn opus, în două conturi diferite, în interval de 3 zile.

---

## Variabile de mediu (.env)

| Variabilă | Descriere |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token de la @BotFather |
| `TELEGRAM_ALLOWED_USER_IDS` | ID-uri Telegram separate prin virgulă |
| `ACTUAL_BUDGET_URL` | URL intern Docker (http://actual-budget:5006) |
| `ACTUAL_BUDGET_PASSWORD` | Parola Actual Budget |
| `ACTUAL_BUDGET_SYNC_ID` | Sync ID din setările Actual Budget |
| `OLLAMA_URL` | URL Ollama (poate fi pe altă mașină din rețea) |
| `OLLAMA_MODEL` | Modelul vision (qwen2.5vl:3b) |
| `MEMORY_DB_PATH` | Calea SQLite (/app/data/memory.db) |
| `DEFAULT_CURRENCY` | Moneda implicită (EUR) |
| `JWT_SECRET` | Secret pentru JWT tokens (web auth) |

---

## Docker — servicii

```yaml
actual-budget  ← port 5006, date în ./data/actual
ollama         ← port 11434, modele în ollama_data volume
majordom       ← FastAPI backend + servire frontend build
```

Ollama poate fi extern (pe altă mașină din rețea) — setezi `OLLAMA_URL` corespunzător.

---

## SQLite — schema

```sql
transactions        ← bonuri foto + tranzacții manuale (context local)
merchant_mappings   ← merchant → categorie confirmată (SmartCategorizer)
category_keywords   ← cuvinte cheie → categorie
budget_limits       ← limite lunare per categorie
csv_profiles        ← profiluri CSV salvate (ING, crypto.com, etc.)
```

---

## Convenții de cod

- **Type hints** pe toate funcțiile publice
- **snake_case** pentru variabile și funcții Python; **camelCase** în TypeScript/React
- **logging** în loc de print (`logger = logging.getLogger(__name__)`)
- **Nu duplica logica** între bot și backend
- **Orice scriere** în Actual Budget → `actual.commit()` la final
- **Fără comentarii** care explică ce face codul — numele funcțiilor și variabilelor fac asta; comentarii doar pentru comportamente non-evidente

---

## Funcționalități implementate

- [x] Procesare bon foto cu AI vision (Ollama)
- [x] Tranzacție manuală (/add pe Telegram)
- [x] Sold și statistici (/balance, /stats pe Telegram)
- [x] Import CSV cu detecție automată format (ING, crypto.com, Revolut, etc.)
- [x] Auto-categorizare din istoricul confirmat (merchant_mappings)
- [x] Categorii confirmate propagate în Actual Budget
- [x] Deduplicare la re-import (SHA256 pe data+merchant+suma)
- [x] Selecție cont la salvare (dacă există mai multe conturi) — Telegram
- [x] Web UI (PWA) v2: FastAPI + React, JWT auth, foto bon, grafic lunar

## Urmează (ordinea implementării)

1. **Account selection pe web PWA** — prerequisit pentru tot ce urmează
2. **Budget status dashboard** — grafic per categorie + rebalansare conversațională
3. **Bottom navigation bar** — Home / Import / Chat
4. **Chat AI assistant** — ActualQL + Ollama, execută acțiuni din chat
5. **CSV import UI web** — port din Telegram
6. **Interactive messages în chat** — butoane, confirmare tranzacții
7. **Document Management System** — foto/PDF → extragere date → stocare
8. **Onboarding conversațional** — Q1-Q15, configurare completă Actual Budget

**Detalii complete pentru fiecare feature** → vezi `ROADMAP.md`

---

*Ultima actualizare: 2026-04-18 (sesiunea — arhitectură AB, onboarding, platformă PWA)*
