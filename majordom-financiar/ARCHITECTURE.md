# Majordom Financiar — Architecture & Developer Guide

> Source of truth pentru orice agent AI sau developer care lucrează la acest proiect.
> Citește acest fișier înainte de orice modificare.

---

## Ce face aplicația

Bot Telegram personal care:
1. Primește poze cu bonuri → extrage datele cu AI vision local (Ollama)
2. Sugerează o categorie bazată pe istoricul tranzacțiilor
3. Salvează tranzacția în Actual Budget după confirmare
4. Permite adăugare manuală, vizualizare sold și statistici

**Principiu fundamental:** zero date în cloud. Totul rulează pe serverul propriu.

---

## Stack tehnic

| Componentă | Tehnologie | Versiune |
|---|---|---|
| Bot Telegram | python-telegram-bot | 21.6 (async) |
| AI vision | Ollama + qwen2.5vl | local HTTP |
| Budget app | Actual Budget | self-hosted Docker |
| Actual client | actualpy | latest |
| Memorie/categorizare | SQLite | via sqlite3 stdlib |
| Imagini | Pillow | 10.4.0 |
| HTTP async | aiohttp | 3.10.5 |
| Config | python-dotenv | 1.0.1 |
| Runtime | Python | 3.11 |
| Deploy | Docker Compose | 3 servicii |

---

## Structura proiectului

```
majordom-financiar/
├── bot/
│   ├── main.py          ← Entry point: pornește Application telegram
│   ├── handlers.py      ← LOGICA PRINCIPALĂ: toate comenzile și fluxurile
│   ├── keyboards.py     ← InlineKeyboardMarkup refolosibile
│   ├── budget_wizard.py ← ConversationHandler pentru /setup_budget
│   └── csv_wizard.py    ← ConversationHandler pentru import CSV (5 stări)
├── csv_importer/
│   ├── profiles.py      ← Dataclasses: CsvProfile, NormalizedTransaction
│   ├── normalizer.py    ← Parsare CSV bytes → NormalizedTransaction[]
│   └── detector.py      ← Detecție format: header signature + Ollama fallback
├── ocr/
│   ├── vision_engine.py ← Trimite poza la Ollama, primește JSON structurat
│   └── parser.py        ← Dataclasses: ReceiptData, ReceiptItem
├── actual_client/
│   └── client.py        ← Async wrapper peste actualpy:
│                            add_transaction(), add_transactions_batch(),
│                            create_account(), get_accounts(), get_categories()
├── memory/
│   ├── database.py      ← SQLite: tranzacții, limite buget, profiluri CSV
│   └── categorizer.py   ← TF-IDF simplu: sugerează categoria pe baza istoricului
├── config/
│   └── settings.py      ← Singleton Settings: toate variabilele din .env
├── scripts/
│   └── setup.sh         ← Bootstrap: creează .env și pornește Docker
├── docker-compose.yml   ← 3 servicii: actual-budget, ollama, majordom-bot
├── Dockerfile           ← Build imagine Python bot
├── requirements.txt
└── .env.example
```

---

## Fluxul principal — procesare bon foto

```
User trimite poză pe Telegram
        │
handlers.py → handle_photo()
        │
        ├── 1. Descarcă poza din Telegram (bytes)
        │
        ├── 2. VisionEngine.extract_from_bytes()
        │       └── resize la 512px (Pillow)
        │       └── encode base64
        │       └── POST la Ollama /api/chat cu imaginea
        │       └── parsează JSON răspuns → ReceiptData
        │
        ├── 3. SmartCategorizer.suggest()
        │       └── TF-IDF pe merchant + items vs istoricul din SQLite
        │       └── returnează categoria cu scorul cel mai mare
        │
        ├── 4. Dacă scor > 0.8 → auto-categorizare
        │   Dacă scor < 0.8 → afișează keyboard cu opțiuni
        │
        └── 5. La confirmare: ActualBudgetClient.add_transaction()
                └── actualpy sync în ThreadPoolExecutor
                └── actual.download_budget() → create_transaction() → actual.commit()
```

---

## Fluxul CSV — import tranzacții bancare

```
User trimite fișier .csv pe Telegram
        │
bot/csv_wizard.py → handle_csv_document()
        │
        ├── 1. CsvNormalizer.parse_csv(bytes)
        │       └── detectează encoding (UTF-8, CP1252, Latin-1)
        │       └── detectează delimiter (; , | tab)
        │       └── returnează headers + rows (list[dict])
        │
        ├── 2. CsvProfileDetector.header_signature(headers)
        │       └── MD5 pe coloanele sortate → fingerprint stabil
        │
        ├── 3a. MemoryDB.get_csv_profile_by_sig(sig)
        │       ↳ GĂSIT → aplică profilul direct → salt la pasul 5
        │
        ├── 3b. NEGĂSIT → CsvProfileDetector.detect_with_ollama()
        │       └── trimite headers + 3 rânduri la Ollama (text, fără imagine)
        │       └── Ollama returnează JSON cu mapping coloane
        │       └── afișează propunerea + 3 exemple normalizate
        │       └── user confirmă → MemoryDB.save_csv_profile()
        │
        ├── 4. Selecție cont (sau creare cont nou via ActualBudgetClient.create_account())
        │
        ├── 5. CsvNormalizer.normalize(rows, profile)
        │       └── include TOATE tranzacțiile (cheltuieli + refund-uri)
        │       └── is_expense=True dacă suma negativă (sau direction col = "Af")
        │       └── is_expense=False pentru refund-uri (suma pozitivă)
        │       └── returnează list[NormalizedTransaction]
        │
        └── 6. La confirmare: ActualBudgetClient.add_transactions_batch()
                └── AUTO_CATEGORY_THRESHOLD = 0.75
                └── pentru fiecare tranzacție:
                │     SmartCategorizer.predict() → categorie auto
                │     dacă confidence >= 0.75 → aplică categoria în Actual Budget
                │     dacă confidence < 0.75 → importă fără categorie, returnează în low_confidence
                │     SHA256(data+merchant+suma) → financial_id determinist (câmpul se numește
                │       financial_id în actualpy, nu imported_id!)
                │     create_transaction() cu amount negativ (expense) sau pozitiv (refund)
                │     skip dacă financial_id există deja
                └── un singur actual.commit() la final
                └── returnează (imported, skipped, errors, low_confidence_list)
                └── csv_wizard trimite mesaj de confirmare categorie pentru fiecare din low_confidence
```

### Limitare importantă: transferuri între conturi

Un transfer ING → crypto.com apare în CSV-ul ING ca o **cheltuială obișnuită**.
Sistemul actual îl importă ca atare — incorect din perspectiva bugetului.

```
ING CSV:  | CRO Pay Europe Ltd | 500.00 | Af  → importat ca cheltuială ❌
crypto.com: | Top Up | 500.00 | credit         → filtrat (venit) ✅
```

**Detectare planificată (v2):**
- Merchant conține cuvânt cheie de cont cunoscut (revolut, bunq, crypto)
- ING: coloana `Code = OV` + `Tegenrekening` e cont propriu
- Matching pe sumă egală intrare/ieșire în aceeași zi între două conturi

Până atunci: după import, corectează manual transferurile în Actual Budget UI
(schimbă categoria în "Transfer" și marchează-le ca transferuri).

---

## Fluxul secundar — tranzacție manuală

```
User: /add 49.99 Uber taxi
        │
handlers.py → cmd_add()
        │
        ├── parse: amount=49.99, description="Uber taxi"
        ├── SmartCategorizer.suggest("Uber taxi")
        └── ActualBudgetClient.add_transaction() → Actual Budget
```

---

## Module critice — ce să NU strici

### 1. Async vs Sync — CRITIC
Tot botul este **async** (python-telegram-bot v21 folosește asyncio).
`ActualBudgetClient` rulează codul sync (`actualpy`) într-un `ThreadPoolExecutor`
pentru a nu bloca event loop-ul.

```python
# CORECT — sync în executor
async def get_accounts(self) -> list[Account]:
    def _get():  # funcție sync internă
        with self._get_actual() as actual:
            ...
    return await self._run(_get)  # rulează sync în thread

# GREȘIT — niciodată asta:
async def get_accounts(self):
    with self._get_actual() as actual:  # sync în async → blochează tot
        ...
```

### 2. actualpy — quirks importante
```python
# Ordinea operațiilor este OBLIGATORIE:
with self._get_actual() as actual:
    actual.download_budget()     # întâi download
    # ... queries ...
    actual.commit()              # la final pentru orice write
```

### 3. Config — totul vine din settings
```python
# CORECT:
from config import settings
url = settings.ollama.url

# GREȘIT:
import os
url = os.getenv("OLLAMA_URL")  # niciodată direct în module
```

### 4. Auth decorator — pe toate comenzile noi
```python
@auth_required  # OBLIGATORIU pe orice handler nou
async def cmd_ceva_nou(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ...
```

### 5. ConversationHandler (budget_wizard.py, csv_wizard.py)
Stările trebuie să returneze exact constantele definite sau `ConversationHandler.END`.
Nu returna `None` sau alte valori.

**CRITIC — pattern matching în CallbackQueryHandler:**
`CallbackQueryHandler(callback, pattern=X)` folosește `re.match()` — ancorează la **începutul** stringului.
Callback data JSON ca `'{"a": "pok"}'` **NU** se potrivește cu pattern-ul `'"a": "pok"'`
pentru că stringul începe cu `{`, nu cu `"`.

```python
# GREȘIT — re.match('"a": "pok"', '{"a": "pok"}') → None
CallbackQueryHandler(handler, pattern='"a": "pok"')

# CORECT — strings simple, fără JSON
# În keyboards.py: callback_data="csv_pok"
# În wizard: pattern="^csv_pok$"
CallbackQueryHandler(handler, pattern="^csv_pok$")
```

Toate butoanele CSV folosesc string-uri simple (nu JSON):
- `csv_pok`, `csv_pno` — confirmare profil
- `csv_asel_{idx}`, `csv_anew`, `csv_acancel` — selecție cont
- `csv_iok`, `csv_icancel` — confirmare import

### 6. CSV import — ordinea înregistrării handler-elor
ConversationHandler-urile **trebuie** înregistrate ÎNAINTE de `CallbackQueryHandler` generic.
Altfel, callback-urile din wizard sunt interceptate de handlerul general.

```python
# CORECT (handlers.py):
app.add_handler(create_budget_conversation())  # mai întâi wizards
app.add_handler(create_csv_conversation(...))
app.add_handler(CallbackQueryHandler(handle_callback))  # la final
```

### 7. Deduplicare tranzacții — bon foto + CSV
**Toate** tranzacțiile (bon foto, /add, CSV) primesc acum un ID determinist:
`SHA256(data + merchant + suma)[:16]`. Dacă aceeași tranzacție există deja în Actual Budget
(de ex. importată anterior din CSV), `add_transaction()` returnează `None` și botul
afișează mesaj "deja existentă" în loc să creeze duplicat.

**ATENȚIE — actualpy naming:** parametrul `imported_id` din `create_transaction()` se
salvează intern ca `financial_id` în modelul `Transactions`. Când citești tranzacții
existente pentru deduplicare, folosește `tx.financial_id`, nu `tx.imported_id`:
```python
existing_ids = {tx.financial_id for tx in existing_txs if tx.financial_id}
```

### 8. Polling — allowed_updates
`app.run_polling()` trebuie să primească explicit `allowed_updates=Update.ALL_TYPES`.
Fără acest parametru, Telegram poate filtra update-urile de tip document (CSV-uri)
în funcție de setările anterioare ale bot-ului.
```python
from telegram import Update
app.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)
```

### 9. Rebuild Docker după modificări de cod
`docker compose restart majordom-bot` NU aplică modificările de cod — doar repornește
containerul cu imaginea existentă. Trebuie rebuild explicit:
```bash
docker compose build majordom-bot && docker compose up -d majordom-bot
```

---

## Variabile de mediu (.env)

| Variabilă | Exemplu | Descriere |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `123:ABC...` | Token de la @BotFather |
| `TELEGRAM_ALLOWED_USER_IDS` | `422151041` | ID-uri separate prin virgulă |
| `ACTUAL_BUDGET_URL` | `http://actual-budget:5006` | URL intern Docker |
| `ACTUAL_BUDGET_PASSWORD` | `parola` | Parola Actual Budget |
| `ACTUAL_BUDGET_SYNC_ID` | `uuid` | Sync ID din Actual Budget |
| `OLLAMA_URL` | `http://10.10.1.99:11434` | Ollama pe rețea locală |
| `OLLAMA_MODEL` | `qwen2.5vl:3b` | Modelul vision |
| `MEMORY_DB_PATH` | `/app/data/memory.db` | SQLite pentru memorie |
| `DEFAULT_CURRENCY` | `EUR` | Moneda implicită |

---

## Docker — 3 servicii

```yaml
actual-budget  ← port 5006, date în ./data/actual
ollama         ← port 11434, modele în ollama_data volume
majordom-bot   ← depinde de actual-budget
```

Ollama poate fi extern (pe altă mașină din rețea) — setezi `OLLAMA_URL` corespunzător.

---

## Convenții de cod

- **Type hints** pe toate funcțiile publice
- **snake_case** pentru variabile și funcții
- **logging** în loc de print (logger per modul: `logger = logging.getLogger(__name__)`)
- **Nu duplica logica** între bot și alte module
- **Orice write** în Actual Budget → `actual.commit()` la final

---

## SQLite — schema completă

```sql
transactions        ← bonuri foto + tranzacții manuale (istoric local)
merchant_mappings   ← merchant → categorie (pentru SmartCategorizer)
category_keywords   ← cuvinte cheie → categorie (învățate din feedback)
budget_limits       ← limite lunare per categorie (setate via /setup_budget)
csv_profiles        ← profiluri CSV salvate (ING, crypto.com, etc.)
                       detectate automat după header_sig (MD5)
```

---

## Funcționalități implementate

- [x] Procesare bon foto (AI vision)
- [x] Tranzacție manuală (/add)
- [x] Sold și statistici (/balance, /stats)
- [x] Wizard buget (/setup_budget)
- [x] Import CSV cu detecție automată format (ING, crypto.com, Revolut, etc.)
- [x] Creare cont din chat
- [x] Refund-uri în CSV importate ca tranzacții pozitive (nu filtrate)
- [x] Auto-categorizare bazată pe istoric confirmat (from_history) — nu pe prag AI
- [x] Categorii confirmate în Telegram propagate înapoi în Actual Budget
- [x] Deduplicare la re-import și la salvare bon foto (SHA256 pe data+merchant+suma)
- [x] Selecție cont la salvare bon foto / /add (dacă există mai multe conturi)
- [x] Câmpuri standardizate: payee = merchant, notes = [foto bon]/[/add manual]/[import CSV]
- [x] 12 categorii curate cu keywords pentru comercianți NL + RO

**Roadmap și priorități** → vezi `CLAUDE.md` (gitignored — conține și context financiar personal).

---

*Ultima actualizare: 2026-04-11 (sesiunea 3 — categorizare, conturi, categorii restructurate)*
