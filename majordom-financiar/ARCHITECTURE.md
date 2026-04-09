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
│   └── keyboards.py     ← InlineKeyboardMarkup refolosibile
├── ocr/
│   ├── vision_engine.py ← Trimite poza la Ollama, primește JSON structurat
│   └── parser.py        ← Dataclasses: ReceiptData, ReceiptItem (folosite de vision_engine)
├── actual_client/
│   └── client.py        ← Async wrapper peste actualpy (sync → async via ThreadPoolExecutor)
├── memory/
│   ├── database.py      ← SQLite: stochează tranzacții și limite buget
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

### 5. ConversationHandler (budget_wizard.py)
Stările trebuie să returneze exact constantele `CHOOSING`, `STEP` sau `ConversationHandler.END`.
Nu returna `None` sau alte valori.

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

## Taskuri active / Roadmap

Vezi `CLAUDE.md` (local, nu e pe GitHub — conține date financiare personale).

---

*Ultima actualizare: 2026-04-10*
