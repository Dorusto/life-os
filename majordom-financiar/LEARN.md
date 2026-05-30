# Ce să înțelegi despre proiectul tău

> Fără jargon inutil. Fiecare concept explicat în contextul codului tău real.
> Dacă înțelegi ce e aici, poți să lucrezi cu orice agent AI fără să fii orbit.

---

## 1. De ce tot codul e `async` — și ce înseamnă asta

### Problema
Botul tău poate primi mesaje de la mai mulți utilizatori simultan (tu + soția, de exemplu).
Dacă procesarea unui bon durează 60 de secunde (Ollama pe CPU), fără async botul
ar îngheța complet și ar ignora orice alt mesaj în acel timp.

### Soluția: async/await
```python
# Fără async — botul îngheață 60s, nimeni altcineva nu poate trimite nimic
def handle_photo(update, context):
    result = process_image(photo)  # blochează 60s

# Cu async — botul "cedează" controlul în timp ce așteaptă
async def handle_photo(update, context):
    result = await process_image(photo)  # "mă întorc când e gata"
```

**Analogia:** E ca la restaurant. Un chelner fără async ia comanda ta, merge în bucătărie
și stă acolo 20 de minute până e gata. Un chelner async ia comanda ta, o duce în bucătărie,
și între timp servește alte 5 mese. Când e gata mâncarea ta, se întoarce.

### Regula de aur în codul tău
- Orice funcție din `bot/handlers.py` este `async`
- Orice funcție care **așteaptă ceva** (Ollama, Actual Budget) folosește `await`
- **`actualpy` este sync** (nu știe de async) → de aceea rulează în `ThreadPoolExecutor`

```python
# actual_client/client.py — de ce e complexă structura
async def add_transaction(self, ...):
    def _add():          # funcție sync — codul actualpy merge aici
        with actual:
            ...
    return await self._run(_add)  # rulează sync într-un thread separat
                                   # fără să blocheze botul
```

---

## 2. Cum funcționează botul Telegram

### Cum primești mesaje
python-telegram-bot v21 folosește **polling** — la fiecare câteva secunde întreabă
serverele Telegram "ai mesaje noi pentru mine?". Alternativa e webhook (Telegram
te sună pe tine), dar polling e mai simplu pentru self-hosted.

### Cum înregistrezi comenzi
```python
# bot/main.py — înregistrarea handlerelor
app.add_handler(CommandHandler("add", cmd_add))       # /add
app.add_handler(CommandHandler("balance", cmd_balance)) # /balance
app.add_handler(MessageHandler(filters.PHOTO, handle_photo)) # orice poză
app.add_handler(CallbackQueryHandler(handle_callback)) # butoane inline
```

### Cele 3 tipuri de mesaje pe care le gestionezi
1. **Comenzi** (`/add`, `/balance`) → `CommandHandler`
2. **Poze** → `MessageHandler(filters.PHOTO, ...)`
3. **Butoane inline** (confirmă/schimbă categoria) → `CallbackQueryHandler`

### `callback_data` — cum funcționează butoanele
Când creezi un buton, îi dai un string secret:
```python
InlineKeyboardButton("✅ Confirmă", callback_data="confirm_123.45_Kaufland")
```
Când userul apasă butonul, botul primește acel string și știe ce să facă.
Datele tranzacției sunt codificate în `callback_data` — asta e de ce handler-ul
de callback parsează string-ul primit.

---

## 3. Cum funcționează AI Vision (Ollama)

### Fluxul complet al unei poze
```
Poză JPEG (bytes)
    ↓
Resize la 512px (Pillow) — mai mic = mai rapid, încape în VRAM
    ↓
Encode în Base64 — transformă bytes în text (ca să poată fi trimis în JSON)
    ↓
POST la http://10.10.1.99:11434/api/chat
    {
      "model": "qwen2.5vl:3b",
      "messages": [{"role": "user", "content": PROMPT, "images": [base64]}]
    }
    ↓
Ollama rulează modelul (30-120 secunde pe CPU)
    ↓
Răspuns JSON:
    {"merchant": "Kaufland", "total": 45.99, "currency": "EUR", "date": "09.04.2026"}
    ↓
ReceiptData (dataclass Python cu câmpurile extrase)
```

### De ce 512px și nu mai mare?
Un model vision "vede" imaginea ca tokeni. La 512px → ~1300 tokeni.
La 1024px → ~5300 tokeni (de 4x mai mult). Mai mulți tokeni = mai lent și mai mult VRAM.
RTX 4070 Mobile are 8GB — la 512px tot intră. La mai mare, cade pe CPU.

### Promptul — tu controlezi ce extrage AI-ul
`ocr/vision_engine.py` → `EXTRACT_PROMPT` — dacă vrei să extragi câmpuri noi
(ex: TVA, metoda de plată), modifici promptul și adaugi câmpul în `ReceiptData`.

---

## 4. Cum funcționează memoria și categorizarea

### Ce stochează SQLite
```
memory.db
├── transactions      ← istoricul: merchant, amount, category, date, actual_budget_id
├── merchant_mappings ← merchant → categorie confirmată de tine
├── category_keywords ← cuvinte cheie → categorie (învățate din feedback)
├── budget_limits     ← limitele setate cu /setup_budget
└── csv_profiles      ← profiluri CSV salvate (ING, crypto.com, etc.)
```

### Cum sugerează categoria — 3 niveluri

**Nivel 1 — Istoric confirmat de tine (from_history=True):**
```
"Lidl" → ai confirmat anterior că e "Alimente & Băuturi"
→ auto-categorizat la import, fără să te întrebe
```

**Nivel 2 — Keywords din config/categories.json:**
```
"albert heijn" → keyword în categoria "Alimente & Băuturi"
→ sugestie, DAR te întreabă oricum — nu e auto
```

**Nivel 3 — TF-IDF pe textul OCR:**
```
Text bon conține "supermarkt" → similar cu bonuri anterioare din "Alimente"
→ sugestie slabă, te întreabă
```

**Regula de aur:** auto-categorizare **doar** dacă tu ai confirmat anterior acel
merchant exact. Un merchant nou te întreabă mereu, indiferent cât de sigur e AI-ul.
Asta previne greșeli silențioase.

### Cum "înveți" botul

Când confirmi o categorie pentru "Patreon* Membership":
1. Se salvează în `merchant_mappings`: `patreon* membership → entertainment`
2. La importul următor: `from_history=True` → auto-categorizat direct
3. Categoria se propagă și în Actual Budget via `update_transaction_category()`

### Cele 12 categorii

Definite în `config/categories.json`. Fiecare are `id`, `name`, `emoji`, `keywords`:

| ID | Nume | Exemple merchants |
|----|------|-------------------|
| groceries | Alimente & Băuturi | Lidl, Albert Heijn, Jumbo |
| restaurants | Restaurante & Cafenele | McDonald's, Thuisbezorgd |
| transport | Transport | NS, Shell, Uber, Bolt |
| utilities | Utilități | Vattenfall, Ziggo, KPN |
| health | Sănătate | Apotheek, Kruidvat, Tandarts |
| clothing | Îmbrăcăminte | H&M, Zara, Zalando |
| home | Casă & Întreținere | IKEA, Coolblue, Praxis |
| entertainment | Divertisment & Vacanță | Netflix, Patreon, Booking.com |
| children | Copii | School, Speelgoed, BSO |
| personal | Bani Personali | Cadouri, donații, discreționari |
| investments | Investiții & Economii | DEGIRO, ETF contributions |
| other | Altele | Catch-all |

---

## 5. Actual Budget — cum salvezi tranzacțiile

### Ce e Actual Budget
O aplicație de bugeting self-hosted (rulează în Docker la port 5006).
Are o interfață web unde vezi toate tranzacțiile, grafice, bugete per categorie.
Botul tău e doar un "input channel" — trimite tranzacții acolo.

### Sync ID — ce e și de unde vine
Actual Budget poate gestiona mai multe "fișiere buget" (ca niște baze de date separate).
`ACTUAL_BUDGET_SYNC_ID` identifică fișierul tău specific. Îl găsești în:
Actual Budget → Settings → Advanced → Sync ID

### Ce face `download_budget()` la fiecare operație
actualpy re-descarcă starea curentă a bugetului înainte de fiecare operație.
E ineficient dar sigur — garantează că lucrezi cu date fresh. Dacă ai adăugat
ceva din interfața web și botu nu știe, nu contează — la next call vede totul.

---

## 6. Docker Compose — cele 3 servicii

```yaml
actual-budget:    # Actual Budget UI + DB, port 5006
    image: actualbudget/actual-server
    ports: 5006:5006

ollama:           # AI local, port 11434
    image: ollama/ollama
    # modele stocate în volum persistent

majordom-bot:     # botul tău Python
    build: .      # construiește din Dockerfile
    depends_on:
      - actual-budget
    # citește .env pentru credențiale
```

### Comunicarea între servicii
În Docker Compose, serviciile se "văd" între ele prin **numele serviciului** ca hostname:
- Botul accesează Actual Budget la `http://actual-budget:5006` (nu `localhost`)
- Botul accesează Ollama la `http://ollama:11434` (sau IP-ul mașinii tale dacă e extern)

---

## 7. Configurarea centralizată (settings.py)

Tot vine din `.env` → citit o singură dată în `config/settings.py` → importat oriunde.

```python
# Orice fișier din proiect face asta:
from config import settings

token = settings.telegram.bot_token
currency = settings.default_currency
```

**De ce e important:** dacă vrei să schimbi orice (URL Ollama, model, monedă),
schimbi **doar în `.env`**. Nu cauți prin 10 fișiere.

---

## Cum citești un bug când apare

Când ceva nu merge, primul loc de căutat:
```bash
docker compose logs majordom-bot --tail=50
```

Structura unui log tipic:
```
INFO  handlers - Poză primită de la user 422151041
INFO  vision_engine - Trimit imaginea la Ollama (qwen2.5vl:3b)...
INFO  vision_engine - Bon extras cu AI: Kaufland, 45.99 EUR, 3 articole
INFO  categorizer - Categorie sugerată: Alimente (scor: 0.92)
INFO  actual_client - Tranzacție adăugată: Kaufland 45.99 → tx-id-123
```

Dacă vezi `ERROR` sau `WARNING`, acea linie îți spune exact unde s-a rupt.

---

## 8. Cum funcționează importul CSV

### Fișierele implicate

```
csv_importer/
├── profiles.py    ← dataclass-uri: CsvProfile, NormalizedTransaction
├── normalizer.py  ← CsvNormalizer: detectează encoding/delimiter, parsează, normalizează
├── detector.py    ← CsvProfileDetector: MD5 signature + Ollama pentru formate noi
└── __init__.py    ← exportă cele 3 clase

bot/csv_wizard.py  ← ConversationHandler cu 5 stări (fluxul de dialog)
memory/database.py ← tabelul csv_profiles în SQLite
```

### Problema: fiecare bancă exportă altfel

ING exportă cu `;` ca delimiter, suma `34,20` (virgulă decimală), coloana `Af Bij`
pentru direcție. crypto.com exportă cu `,`, suma `34.20` (punct), fără coloană de
direcție — suma negativă înseamnă cheltuiala. Revolut e iar altfel.

Dacă ai scrie un parser separat pentru fiecare bancă, ai de actualizat codul de
fiecare dată când o bancă schimbă formatul.

### Soluția: profiluri salvate + AI pentru formate noi

**Prima dată** când trimiți un CSV necunoscut:
```
CSV primit → Ollama analizează headerele + 3 rânduri →
propune mapping → tu confirmi → salvat în SQLite ca "profil"
```

**A doua oară** același format:
```
CSV primit → MD5(coloane sortate) → găsit în SQLite → aplicat direct
```
Fără Ollama, instant.

### State machine — fluxul de dialog (csv_wizard.py)

ConversationHandler are 5 stări. Botul nu e un simplu if/else — e o mașină de stări
care reține unde ești în conversație:

```
User trimite .csv
       │
       ▼
[handle_csv_document]
  ├─ format CUNOSCUT (MD5 în SQLite) ──────────────────────────────┐
  │                                                                 │
  └─ format NOU → Ollama → propune mapping                         │
           │                                                        │
           ▼                                                        ▼
    CONFIRM_PROFILE                                         SELECT_ACCOUNT
    ├─ "Da" → salvează profil în SQLite                     ├─ alege cont existent
    └─ "Nu" → END                                           └─ "Cont nou" ──┐
           │                                                         │       │
           └──────────────────────────────────────────────────────────       │
                                                                    ▼        ▼
                                                             CREATE_ACCT_NAME
                                                                    │
                                                             CREATE_ACCT_BAL
                                                                    │
                                                                    ▼
                                                             CONFIRM_IMPORT
                                                              ├─ "Importă" → batch în Actual
                                                              └─ "Anulează" → END
```

Stările sunt numere întregi (20-24) — python-telegram-bot le folosește intern
ca chei de dicționar. Fiecare stare știe ce mesaje/butoane acceptă.

### De ce MD5 pe coloanele sortate?

Dacă ING adaugă o coloană nouă în viitor, semnătura se schimbă → bot-ul detectează
un "format nou" și te întreabă din nou. E intentionat — mai bine o confirmare în
plus decât să parsezi greșit.

```python
# detector.py — header_signature()
normalized = ",".join(sorted(h.strip().lower() for h in headers))
return hashlib.md5(normalized.encode()).hexdigest()[:12]
# ex: ["Datum", "Bedrag", "Naam"] → "bedrag,datum,naam" → "a3f8c12d4e9b"
```

### Cum se normalizează suma (normalizer.py)

ING: `"34,20"` cu `decimal_sep=","`:
```python
"34,20".replace(".", "").replace(",", ".") → "34.20" → float(34.20)
```

ING cu mii: `"1.234,56"`:
```python
"1.234,56".replace(".", "") → "1234,56" → .replace(",", ".") → "1234.56"
```

crypto.com: `"-15.99"` cu `decimal_sep="."` și fără coloană de direcție:
```python
float("-15.99") → suma negativă → is_expense=True, amount=15.99
```

### Ce stochează un CsvProfile (profiles.py)

```python
@dataclass
class CsvProfile:
    source_name: str    # "ING", "crypto.com"
    header_sig: str     # MD5 → fingerprint formatului
    col_date: str       # ex: "Datum"
    col_merchant: str   # ex: "Naam / Omschrijving"
    col_amount: str     # ex: "Bedrag (EUR)"
    col_currency: str   # ex: "" (ING e mereu EUR)
    col_direction: str  # ex: "Af of Bij"
    expense_indicator: str  # ex: "Af"
    date_format: str    # ex: "%d-%m-%Y"
    delimiter: str      # ";" sau ","
    decimal_sep: str    # "," sau "."
```

### Categoriile per tranzacție la import

La import batch, pentru fiecare tranzacție:
- Merchant **confirmat anterior de tine** (`from_history=True`) → aplicat direct în Actual Budget
- Merchant **nou** (inclusiv dacă AI-ul e "sigur") → importat fără categorie, bot trimite mesaj

```
Import finalizat (2 auto-categorizate din istoric, 3 necesită confirmare)
    │
    ├── 🤔 "Claude.Ai Subscription -21.78 EUR"
    │       Sugestie: Utilități (keyword match) — Ești de acord? [✅ Corect] [❌ Schimbă]
    │
    └── 🤔 "Patreon* Membership -10.89 EUR"
            Sugestie: Divertisment & Vacanță (keyword match) — Ești de acord?
```

Când confirmi → `categorizer.learn()` + categoria se propagă în Actual Budget automat.
Data viitoare, același merchant e recunoscut și auto-categorizat fără întrebare.

### Refund-uri — cum sunt tratate

CSV-ul poate conține refund-uri (sume pozitive). Acestea NU sunt filtrate — sunt incluse
în import ca tranzacții pozitive (income în Actual Budget), astfel totalul net e corect:

```
VPN charge:  -5.00 EUR (is_expense=True)  → -5 EUR în Actual Budget
VPN refund:  +5.00 EUR (is_expense=False) → +5 EUR în Actual Budget
Net:          0.00 EUR ✓
```

Preview-ul arată `-5.00` și `+5.00` cu semne explicite.

### Deduplicare — cum evită dublurile la re-import

Fiecare tranzacție importată din CSV primește un `imported_id` unic:
```python
# SHA256 din: source_name + data + merchant + suma
imported_id = sha256(f"{source}:{date}:{merchant}:{amount}").hexdigest()[:16]
```

Înainte de a salva în Actual Budget, verifică dacă `imported_id` există deja în SQLite.
Dacă da → skip. Dacă trimiți același CSV de două ori, a doua oară 0 tranzacții importate.

---

## 9. Transferuri între conturi — de ce e complicat

### Cazul concret

Transferi 500 EUR din ING în crypto.com. Apar în CSV-uri:

```
ING CSV:
  20-03-2025 | CRO Pay Europe Ltd | 500,00 | Af ← cheltuială?

crypto.com CSV:
  2025-03-20 | Top Up | EUR | 500.00 | card_top_up ← venit (filtrat)
```

**Problema:** În ING apare ca ieșire de bani — corect din punct de vedere bancar,
dar **incorect pentru buget**. Nu ai cheltuit 500 EUR, i-ai mutat.

### Cum tratează Actual Budget transferurile

Actual Budget are un tip special de tranzacție: **transfer**. E de fapt două
tranzacții legate:
- Cont ING: -500 EUR (ieșire)
- Cont crypto.com: +500 EUR (intrare)

Ambele sunt legate între ele și nu contează ca cheltuiala în statistici.

### Ce face sistemul acum (v1)

Importă transferul ca cheltuiala obișnuită din ING. Apare în statistici ca -500 EUR
cheltuiți, ceea ce strică raportul lunar.

**Workaround manual:** după import, în Actual Budget UI:
1. Găsești tranzacția "CRO Pay Europe Ltd"
2. O editezi → schimbi tipul din "Expense" în "Transfer"
3. Selectezi contul destinatar (crypto.com)

### Cum se va detecta automat (v2)

Trei semnale:
1. **Keyword în merchant:** "revolut", "bunq", "crypto", "n26", "bitvavo" → probabil transfer
2. **ING-specific:** coloana `Code = OV` (Overschrijving) + `Tegenrekening` e alt cont al tău
3. **Matching sume:** -500 EUR din ING pe 20.03 + +500 EUR în crypto.com pe 20-21.03

Când toate trei se aliniază → creat ca transfer în Actual, nu ca cheltuiala.

---

## Rezumat — ce să ții minte

| Concept | Esența |
|---|---|
| `async/await` | Botul nu îngheață când Ollama e lent |
| `ThreadPoolExecutor` | actualpy (sync) rulează fără să blocheze botul (async) |
| `callback_data` | Datele tranzacției sunt în stringul butonului |
| TF-IDF categorizer | Învață din istoricul TĂU, nu din AI |
| `download_budget()` | Sincronizare cu Actual Budget la fiecare operație |
| `settings` singleton | Tot vine din `.env`, schimbi acolo nu în cod |
| Docker networking | Serviciile se văd prin numele lor, nu `localhost` |
| CSV header signature | MD5 pe coloane sortate → identifică formatul fără să parsezi tot |
| SHA256 pe toate tx | Bon foto + /add + CSV — același hash → nu creează duplicate |
| `from_history` flag | Auto-categorizare doar dacă TU ai confirmat acel merchant |
| payee / notes | payee = merchant, notes = [foto bon] / [/add manual] / [import CSV] |
| Selecție cont | La bon foto cu mai multe conturi, botul te întreabă înainte de a salva |
| Transfer vs cheltuiala | Un transfer ING→crypto apare ca cheltuiala în CSV — corecție manuală în v1 |

---

*Dacă un concept tot nu e clar după ce l-ai citit, întreabă — nu lăsa nelămuriri acumulate.*

---

## 10. Arhitectura v2 — Web UI în loc de Telegram

### Ce s-a schimbat

Interfața Telegram a fost înlocuită cu o aplicație web (PWA). Logica de business
nu s-a schimbat — doar "transportul" prin care ajunge la tine.

**Înainte (v1):**
```
Tu → Telegram → bot/handlers.py → ocr/ + memory/ + actual_client/
```

**Acum (v2):**
```
Tu → Browser → backend/api/ → backend/services/ → backend/core/
```

Telegram încă funcționează ca transport opțional (pornit cu `--profile telegram`).

---

### Structura v2

```
majordom-financiar/
├── backend/
│   ├── core/               ← logica de business (mutat din rădăcină)
│   │   ├── ocr/            ← VisionEngine — extrage date din bonuri
│   │   ├── memory/         ← MemoryDB + SmartCategorizer
│   │   ├── actual_client/  ← ActualBudgetClient
│   │   ├── csv_importer/   ← parsare CSV
│   │   └── config/         ← settings.py, categories.json
│   ├── api/                ← route handlers FastAPI (înlocuiesc bot/handlers.py)
│   │   ├── auth.py         ← POST /api/auth/login → JWT
│   │   ├── receipts.py     ← POST /api/receipts + /receipts/{id}/confirm
│   │   └── transactions.py ← GET /api/transactions + /accounts
│   ├── services/
│   │   └── receipt_service.py  ← logică pură, fără dependențe HTTP sau Telegram
│   └── main.py             ← FastAPI app
├── bot/                    ← Telegram (opțional, neschimbat)
└── frontend/               ← React PWA
    ├── src/
    │   ├── pages/          ← Login, Home, ReceiptFlow
    │   ├── components/     ← TransactionItem, etc.
    │   └── lib/            ← api.ts (toate fetch-urile), auth.ts (JWT storage)
    └── Dockerfile          ← build React → Nginx
```

---

### Conceptul cheie: Service Layer

`backend/services/receipt_service.py` este noul centru al aplicației.
Conține logica de business fără să știe dacă e apelat din web sau din Telegram.

```python
# receipt_service.py — apelat din ambele locuri:
service = ReceiptService()
result = await service.process_image(image_bytes)  # OCR + categorize
tx = await service.confirm(merchant, amount, ...)   # save to Actual Budget
```

```python
# backend/api/receipts.py (web) — formatează rezultatul ca JSON
return ReceiptDraft(merchant=result["merchant"], ...)

# bot/handlers.py (Telegram) — formatează rezultatul ca mesaj Telegram
await update.message.reply_text(f"Merchant: {result['merchant']}")
```

Același service, două formate de răspuns. Dacă schimbi logica (ex: adaugi validare
pe sumă), o schimbi într-un singur loc.

---

### Fluxul bon foto în v2

```
User selectează poza în browser
        │
        ▼
Home.tsx — stochează poza în sessionStorage, navighează la /receipt
        │
        ▼
ReceiptFlow.tsx — uploadă poza imediat la montare
        │
        ▼
POST /api/receipts (backend/api/receipts.py)
  ├── salvează poza pe disk: /app/data/uploads/{uuid}.jpg
  └── apelează ReceiptService.process_image()
              ├── VisionEngine.extract_from_bytes() → Ollama (~30-60s)
              ├── SmartCategorizer.predict() → sugestie categorie
              └── ActualBudgetClient.get_accounts() → lista conturi
        │
        ▼
ReceiptDraft JSON → ReceiptFlow.tsx afișează formularul pre-completat
        │
        ▼
User editează + apasă Confirm
        │
        ▼
POST /api/receipts/{id}/confirm
  └── ReceiptService.confirm()
              ├── ActualBudgetClient.add_transaction() → Actual Budget
              └── SmartCategorizer.learn() → actualizează memoria
        │
        ▼
Animație checkmark → navigare înapoi la Home
```

---

### Docker Compose v2 — 4 servicii default + 1 opțional

```
actual-budget   ← neschimbat (port 5006)
ollama          ← neschimbat (port 11434)
majordom-api    ← nou: FastAPI, nu e expus direct la host
majordom-web    ← nou: Nginx cu React, port ${WEB_PORT:-3000}
majordom-bot    ← opțional: --profile telegram
```

**De ce `majordom-api` nu e expus direct?**
Tot traficul trece prin Nginx (`majordom-web`). Nginx proxiază `/api/` la
`http://majordom-api:8000/api/`. Avantaj: un singur port, un singur certificat SSL,
API-ul nu poate fi accesat direct din afara rețelei Docker.

---

### Auth — JWT tokens

Utilizatorii sunt definiți în `.env`:
```
USER1_USERNAME=doru
USER1_PASSWORD=parola_mea
```

La login:
1. POST `/api/auth/login` cu `{username, password}`
2. Backend verifică parola (bcrypt), returnează un JWT token
3. Token-ul se salvează în `localStorage` (7 zile)
4. Toate requesturile ulterioare trimit `Authorization: Bearer <token>`

**De ce localStorage și nu cookies?**
Pe o rețea privată Tailscale (fără internet public), CSRF nu e o amenințare reală.
localStorage e mai simplu și funcționează identic pe iOS, Android, și desktop.

---

### Cameră și Galerie pe mobil

Două butoane separate în `Home.tsx`:

```html
<!-- Camera: capture="environment" deschide camera din spate direct -->
<input type="file" accept="image/*" capture="environment">

<!-- Gallery: fără capture → utilizatorul alege din bibliotecă -->
<input type="file" accept="image/*">
```

**Cerință:** HTTPS pentru acces la cameră în browser.
- Tailscale: `tailscale cert device.tail-xxx.ts.net` → certificat Let's Encrypt gratuit
- Coolify cu domeniu propriu: gestionează Let's Encrypt automat
- Dezvoltare locală: `localhost` funcționează fără HTTPS

---

### Unde să cauți când ceva nu merge

| Problemă | Unde să cauți |
|----------|---------------|
| Login nu funcționează | `docker compose logs majordom-api` — verifică USER1_USERNAME/PASSWORD în .env |
| Poza nu se procesează | `docker compose logs majordom-api` — verifică că Ollama e pornit |
| Tranzacția nu apare | Verifică `ACTUAL_BUDGET_SYNC_ID` și `ACTUAL_BUDGET_PASSWORD` |
| Frontend alb/erori JS | `docker compose logs majordom-web` — verifică build-ul React |
| Telegram bot nu merge | `docker compose --profile telegram logs majordom-bot` |

```bash
# Pornire normală (web UI)
docker compose up -d

# Web UI + Telegram bot
docker compose --profile telegram up -d

# Rebuild după modificări de cod
docker compose build majordom-api majordom-web && docker compose up -d
```

---

| Concept v2 | Esența |
|---|---|
| `ReceiptService` | Logică pură, fără Telegram/HTTP — apelat din API și bot |
| `backend/core/` | Modulele mutate din rădăcină — `from backend.core.ocr...` |
| `PYTHONPATH=/app` | Face `from backend.core...` să funcționeze în Docker |
| JWT 7 zile | Token-ul durează o săptămână — nu trebuie să te loghezi des |
| Nginx proxy | Ascunde API-ul, proxiază `/api/` → `majordom-api:8000` |
| `--profile telegram` | Botul nu pornește implicit — opt-in explicit |
| sessionStorage | Poza se transferă de la Home la ReceiptFlow fără re-upload |
| Multi-stage Docker | Node compilează React → Nginx servește — imaginea finală e mică |

---

*Ultima actualizare: 2026-05-19 (sesiunea 6 — M1 Daily Driver, budget rebalancing)*

---

## 11. Cum funcționează chat-ul și tool-calling

### Două modele, două roluri

- **qwen2.5vl** → bonuri foto (vision). Nu știe de chat.
- **qwen2.5:7b** → conversație + tool-calling.

### Fluxul unui mesaj (vezi `api/chat.py`)

```
Mesaj utilizator
    ↓
Backend injectează snapshot AB în system prompt (conturi, categorii, stats, ultimele 20 tx)
    ↓
Ollama: tool_call? → execută propose_transaction → card confirmare în UI → tu apeși OK → salvat
        text?      → returnat direct ca streaming
```

`force_tool`: dacă mesajul conține o sumă în bani, backend-ul forțează un tool call — 7b tinde altfel să scrie propunerea ca text în loc să cheme tool-ul.

### Principiul cheie

**LLM = traducător din limbaj natural în parametri structurați. Logica = backend.**

Starea, calculele și condițiile stau în cod. LLM-ul face un singur lucru per cerere: înțelege ce a spus utilizatorul sau formulează un răspuns. Dacă nu extrage ce trebuie după 2-3 încercări → fallback la UI simplu (formular, butoane).

### Limitările lui 7b

- Nu știe date istorice dincolo de snapshot-ul injectat
- Se pierde în raționament multi-step cu condiții înlănțuite
- Generează ActualQL eronat pe query-uri complexe — mai sigur: tool-uri predefinite cu parametri
- M2 onboarding eșuează dacă LLM-ul ține starea în loc de backend (state machine)

---

## 2026-05-19 — M1.2: chat tools — propose_transaction, rebalance, transfer

**Problema:** Chatbot-ul trebuia să înregistreze tranzacții, să rebalanseze bugete și să transfere bani între conturi — tot din conversație, cu confirmare vizuală.

**Ce s-a întâmplat:** llama3.1:8b și hermes3:8b scriu tool call-urile ca text în `content`, nu în `tool_calls` (bug de template Ollama). qwen3:8b rezolvă problema. În plus, qwen3 are "thinking mode" activ implicit — trebuie dezactivat cu `"think": false` altfel nu returnează nimic vizibil câteva zeci de secunde.

**Soluția:** Routing pe 3 intenții (`transaction` / `action` / `info`) — pentru `info` stream direct fără tool detection. `think: false` în payload Ollama. `propose_transaction` are doar `merchant` + `amount` obligatorii, backend completează restul (dată, cont, categorie).

**De reținut:** `actualpy.create_transfer` nu creează automat a doua tranzacție — un transfer în AB sunt DOUĂ tranzacții legate prin `transfer_id`. Rămas de implementat.

---

## 2026-05-19 — M1.1: budget rebalancing conversațional

**Problema:** Bon foto dădea timeout pe hardware lent și cod mort era lăsat în proiect.

**Ce s-a întâmplat:** Timeout-urile nginx și Python erau prea scurte (120s), procesarea OCR pe CPU poate dura mai mult.

**Soluția:** Crescut timeout-urile la 300s, șters cod mort, ROADMAP actualizat. Scris spec complet pentru M1.1 (mutare bani între categorii din chat) în `scripts/prompts/deepseek/001_m1-budget-rebalancing.md`.

**De reținut:** `actualpy.create_budget(session, month, category, amount)` face upsert — funcția corectă pentru a seta alocarea unui buget pe categorie. `month` trebuie să fie `datetime.date`, nu string.

---

## 2026-05-20 — tool_choice=auto + qwen3:14b + query tools

**Problema:** qwen3:8b cu intent routing regex era fragil — nu scala cu mai multe tool-uri sau limbi. Nevoie de `tool_choice=auto` fără routing manual.

**Ce s-a întâmplat:** qwen3:8b inconsistent (fail pe propoziții complexe), granite3.2:8b și hermes3:8b scriu tool call-urile ca text (bug Ollama template). qwen3:14b trece 5/5 scenarii: cheltuială, venit, rebalansare, interogare, off-topic.

**Soluția:** Eliminat intent routing și injecția de date financiare din system prompt. Adăugate 5 query tools (get_accounts, get_monthly_stats, get_budget_status, get_transactions, get_spending_history) — LLM decide ce să fetch-uiască. `OLLAMA_CHAT_MODEL=qwen3:14b`. System prompt redus la ~800 chars.

**De reținut:** Transferurile AB au `transferred_id` pe tranzacție — filtrează-le din statistici de cheltuieli altfel sunt numărate ca expenses. Categoriile de tip income au `is_income=True` pe obiectul Category — filtrează și astea. `get_budget_status` omitea categoriile cu buget 0 și cheltuieli 0 — include toate categoriile non-hidden din `get_categories()`.

---

## 2026-05-21 — Dashboard fix + CSV categories din AB

**Problema:** Dashboard-ul arăta numere greșite față de AB. CSV import crea categorii noi greșite (ex. "Groceries & Drinks") în loc să folosească ce există în AB.

**Ce s-a întâmplat:** AB nu șterge niciodată hard o categorie — o marchează `tombstone=1` (soft delete pentru CRDT sync). Tranzacțiile păstrează `category_id` valid pentru categoria ștearsă, dar `get_categories()` o omite → spending-ul era invizibil. Pe CSV, `_CATEGORY_NAMES` hardcodat mapa ID-uri interne la nume noi, în loc să folosească ce există în AB.

**Soluția:** Tombstone remap în `get_budget_status`: fuzzy match (cutoff 0.4) după nume din `all_raw` → categoria vie echivalentă, re-atribuie spending. CSV preview: o singură sesiune AB returnează `existing_ids` + `ab_categories` reale; confirm nu creează niciodată categorii noi. SQLite cleanup: tabelele `transactions` și `budget_limits` șterse (date financiare nu au ce căuta în SQLite).

**De reținut:** AB = soft delete mereu. Dacă numere nu se leagă, caută `tombstone=1` cu tranzacții asociate. `_map_to_ab_category` face prefix match apoi difflib fuzzy (cutoff 0.5) pentru a mapa orice ID intern la un nume real AB.

---

## 2026-05-21 — AccountTransferCard cu selectoare + reguli workflow

**Problema:** Cardul de transfer între conturi afișa text static. Când LLM-ul ghicea greșit conturile (ex. "Cheltuieli", "Economii" care nu există în AB), nu era nicio cale de corecție înainte de confirmare.

**Soluția:** `propose_account_transfer` face acum fuzzy-match pe numele conturilor reale din AB și returnează lista completă. `AccountTransferCard` afișează dropdown-uri FROM/TO (același pattern ca `BudgetRebalanceCard`) — userul poate corecta dacă LLM-ul a ghicit greșit. Confirm dezactivat dacă from = to.

**De reținut:** `set_transaction_payee` din actualpy creează automat a doua tranzacție a transferului când payee-ul are `transfer_acct` setat — mecanismul funcționează, nu e nevoie să creezi manual ambele tranzacții. Rebuild Docker după orice schimbare (`docker compose build majordom-api majordom-web && docker compose up -d majordom-api majordom-web`).

---

## 2026-05-21 — Onboarding flow M2: state machine server-side, LLM doar parsează răspunsuri

### Problema
Vrem un wizard de configurare în care utilizatorul răspunde la 15 întrebări și la final Majordom creează automat conturi, categorii și schedule-uri în Actual Budget — totul prin conversație, fără să deschidă AB.

### Ce s-a întâmplat

**Arhitectura aleasă: state machine server-side, nu LLM-driven.**

Alternativa (LLM gestionează fluxul) ar fi mai flexibilă, dar impredictibilă — LLM-ul poate sări întrebări, repeta, haluci starea curentă. Soluția: serverul știe întotdeauna la ce întrebare e userul (`current_question` în SQLite). LLM-ul face un singur lucru: parsează răspunsul în free text → JSON structurat.

```
User: "cam 2000 euro pe luna"
LLM (parse_prompt): → {"monthly_income": 2000}
Server: salvează în SQLite, avansează la Q4
```

**Buguri introduse de DeepSeek și cum au fost rezolvate:**

1. **Importuri actualpy greșite** — `Category`, `Schedule`, `ScheduleValues` din `actual.database` nu există. Fix: `from actual.queries import create_category_group, create_category, create_schedule` și `from actual.schedules import Schedule as ScheduleConfig`.

2. **`think: False` lipsă** — qwen3 intră în thinking mode și răspunsul e blocat. Fix: adăugat `"think": False` în toate payload-urile Ollama, inclusiv în cel de parsing LLM din onboarding service.

3. **`"type": "question"` vs `"type": "onboarding_question"`** — service-ul returnează `"type": "question"`, `onboarding.py` wraps corect la `"onboarding_question"`, dar `chat.py` emitea direct rezultatul brut pentru prima întrebare. Fix: emit explicit `"onboarding_question"` în `chat.py`.

4. **Două obiecte JSON într-un singur chunk HTTP** — `{"type":"onboarding_start"}\n{"type":"onboarding_question"...}` ajung concatenat și `JSON.parse` pică. Fix: în `handleChatChunk` pe frontend, dacă parse eșuează și chunk-ul conține `\n`, split pe linii și procesează recursiv. **Important:** split-ul NU se face în `api.ts` (strică streaming-ul text — tot textul se bufferează și apare deodată la final).

5. **Token key greșit** — DeepSeek a folosit `localStorage.getItem('token')` dar cheia reală e `majordom_token` (prin `getToken()` din `auth.ts`). Rezultat: 401 la click pe ClarificationCard → redirect la login. Fix: înlocuit toate accesele directe la localStorage cu `getToken()` și `clearAuth()`.

6. **Stale localStorage** — `onboarding_active=true` rămânea în localStorage după sesiuni vechi, activând placeholder-ul "Answer the question..." la fiecare încărcare. Fix: la mount, verifică `GET /api/onboarding/status` — dacă backend-ul zice `active: false`, șterge localStorage.

### Soluția

Flux final:
```
Chat: "set up my budget"
  → chat.py detectează trigger → creează sesiune → returnează onboarding_start + Q1
  → frontend: setIsOnboarding(true), afișează progress bar
  → userul răspunde (text sau ClarificationCard button)
  → POST /api/onboarding/message → LLM parsează → server avansează → returnează Q următor
  → după Q15: Phase 2 rulează → creează conturi/categorii/schedules în AB
  → frontend: onboarding_complete → ieșire din mod onboarding
```

### De reținut
- `actualpy` nu are `Category`/`Schedule` ca clase importabile din `actual.database` — folosește funcțiile query din `actual.queries` și `Schedule` config din `actual.schedules`.
- Niciodată split pe `\n` în `api.ts` pentru streaming — bufferizează tot textul. Split-ul se face în handler-ul specific (`handleChatChunk`), numai când JSON.parse eșuează.
- Cheile localStorage pentru auth sunt în `frontend/src/lib/auth.ts` — niciodată `localStorage.getItem('token')` direct.

---

## 2026-05-22 — Categorii șterse (tombstone) + payee din bon

### Problema
Două bug-uri distincte descoperite în aceeași sesiune:
1. `What are my biggest expenses?` returna `Deleted:22d43648` în loc de numele categoriei
2. După confirmarea unui bon, payee-ul nu apărea în Actual Budget

### Ce s-a întâmplat

**Bug 1 — Deleted category:**
Când ștergi o categorie din AB, ea devine "tombstoned" — dispare din lista de categorii dar tranzacțiile vechi păstrează `category_id`-ul ei. În `get_monthly_stats()`, codul găsea `category_id` fără obiect `category` asociat și afișa `Deleted:22d43648` (primele 8 caractere din UUID).
Logica de remap tombstone exista deja în `get_budget_status()` dar **lipsea din `get_monthly_stats()`**.

**Bug 2 — Payee din bon:**
Lanț lung de investigație. Puncte cheie:
- `docker compose restart` nu ajută — codul e baked în imagine, trebuie `docker compose build`
- Logger-ul custom (`logging.getLogger(__name__)`) nu apărea în docker logs — `main.py` nu configurează root logger, deci nivel default e WARNING. `print(..., flush=True)` funcționează garantat.
- Diagnosticul cu `print` a arătat că payee-ul (`'Kruidvat'`) ajungea corect în `add_transaction`
- Testul direct în container a confirmat că mecanismul `create_transaction(session, payee='Kruidvat')` + `actual.commit()` funcționează și se sincronizează cu serverul AB
- `actualpy` folosește un event listener `before_flush` care generează mesaje de sync pentru toate obiectele noi/modificate din sesiune. Mesajele includ payee-ul, PayeeMapping-ul și `transactions/description` (care e de fapt `payee_id` în protocolul CRDT al AB)
- `group_id` setat → `sync_sync` se apelează → datele ajung pe server

**Cauza rădăcină a Bug 2:** Neclară după investigație extinsă. Payee-ul apare în SQLite local și în readback-ul Python, dar nu în AB UI pentru unele tranzacții. Ipoteza: tranzacții adăugate cu versiunile vechi ale codului (înainte de fix) rămân fără payee; cele noi funcționează. Nebug-ul a rămas nerezolvat — costul investigației a depășit valoarea practică.

### Soluția

**Bug 1** — adăugat remap tombstone în `get_monthly_stats()` (același algoritm ca în `get_budget_status()`): fuzzy match după nume între categoriile șterse și cele vii, remapare spending.

**Bug 2** — evoluție a codului:
- Inițial: `_safe_get_or_create_payee` cu `session.add()` direct + `session.flush()` → lipsea `PayeeMapping`
- Fix 1: înlocuit cu `create_payee()` din actualpy (include PayeeMapping) dar fără `session.flush()` → lookup-ul din `set_transaction_payee` nu găsea payee-ul în DB
- Fix 2: `create_payee()` + `session.flush()` → teoretic corect
- Fix 3 (final): pasat direct string-ul la `create_transaction()` → actualpy gestionează totul intern

### De reținut
- `docker compose restart` ≠ `docker compose build` — codul baked în imagine nu se schimbă la restart
- `print(..., flush=True)` > `logger.info()` pentru debug rapid în containere fără logging configurat
- `actualpy.create_transaction(session, payee="NumePayee")` funcționează end-to-end cu sync, nu e nevoie să creezi manual obiectul Payees
- `actualpy` change tracking: event `before_flush` → `session.info["messages"]` → `actual.commit()` → `sync_sync()`. Dacă `group_id` e None, sync nu se apelează (modificări doar locale)
- `transactions/description` în protocolul CRDT al AB = `payee_id` în SQLite (nu câmpul `notes`)
- Diagnosticul corect pentru "payee lipsă": verifică direct în container cu `get_transactions()` + `tx.payee.name`, nu te baza pe UI care poate arăta cache
- Onboarding state persistent în SQLite (`onboarding_state` table) — nu în memory LLM. Dacă userul închide browser-ul și revine, progresul e salvat.

---

## 2026-05-30 — Transfer detection: de ce a eșuat și ce e soluția corectă

### Problema
ING NL nu include câmpurile Group/Subgroup din web interface în exportul CSV. Transferurile interne (ex: ING Curent → ING Savings) apar ca tranzacții normale și trebuie excluse manual la import.

### Ce s-a întâmplat
Am implementat detecție automată bazată pe câmpuri CSV (`col_transfer_indicator`): dacă coloana `Counterparty` e goală → rând marcat ca transfer candidat. Logica e corectă (ING pune IBAN în Counterparty pentru transferuri externe, lasă gol pentru conturi proprii), dar implementarea a produs o corupție în SQLite:

Profilul ING din SQLite a ajuns cu `col_merchant="Counterparty"` (adică colona pentru merchant era setată la coloana counterparty). Efectul: toți comercianții apăreau ca IBAN-uri goale sau date greșite. Cauza exactă a corupției nu e clară — probabil un conflict între re-seeding și modificarea manuală a SQLite.

**Alte probleme descoperite:**
- Profilul Dutch ING (Tegenrekening) era configurat cu `col_transfer_indicator="Counterparty"` — coloana greșită → toate rândurile Dutch ar fi fost marcate ca transfer
- `bank2ynab` este un tool CLI, nu o bibliotecă Python — nu poate fi importat, profilele au fost copiate manual din `bank2ynab.conf`

### Soluția (temporară)
Detection dezactivat (`col_transfer_indicator=""`). Transferurile se exclud manual în preview.

### Soluția corectă (ROADMAP)
**Pair matching cross-cont:** după import, compară tranzacțiile deja existente în AB. Dacă suma +X apare la un cont și -X la altul în interval de ±3 zile → transfer. Nu depinde de câmpuri CSV, funcționează pentru orice bancă.

### De reținut
- Nu implementa detecție de transfer via câmpuri CSV — profilele sunt fragile și greu de testat corect
- `docker compose restart` NU rebuild-uiește imaginea — codul baked în imagine rămâne vechi; trebuie `docker compose build --no-cache`
- Verifică întotdeauna SQLite după seed: `docker exec majordom-api python3 -c "import sqlite3; ..."` — ce e în fișier și ce e în DB pot diferi dacă containerul n-a fost restartat
- LLM category suggestions (task 007) implementat în `backend/api/csv_import.py` — funcționează când Ollama e accesibil din container

---

## 2026-05-30 — Ollama corupe SQLite + SmartCategorizer vs AB

### Problema
După rebuild, importul CSV arăta din nou IBAN-uri ca merchant în loc de numele comerciantului. Plus: LLM-ul de categorization dădea timeout.

### Ce s-a întâmplat

**Corupția SQLite prin Ollama:**
La un import anterior, CSV-ul a fost parsat cu delimitatorul greșit (`,` în loc de `;`) — probabil pentru că European amounts (`150,00`) au mai multe virgule decât puncte în primele rânduri, confuzând auto-detecția. Cu delimitatorul greșit, headers-ul devenea o singură coloană mare → signature MD5 necunoscută → Ollama chemat pentru detecție → Ollama a returnat `col_merchant="Counterparty"` → profil corupt salvat în SQLite cu un alt `header_sig`.

Profilele built-in (re-seed la fiecare startup) nu suprascriu profilul corupt pentru că au `header_sig` diferit. Deci ambele coexistă în SQLite, și cel corupt câștigă dacă e detectat primul.

**Fix anti-corrupție:** înainte să salveze un profil detectat de Ollama, backend-ul verifică dacă există deja un profil confirmat (`confirmed=True`) cu același `source_name`. Dacă da, Ollama e folosit pentru importul curent dar **nu se salvează** în SQLite.

```python
confirmed_banks = {p.source_name for p in db.get_all_csv_profiles() if p.confirmed}
if profile.source_name not in confirmed_banks:
    db.save_csv_profile(profile)
```

**Timeout LLM categorization:**
`qwen3:14b` la 8.8GB depășește VRAM-ul de 8GB → rulează parțial pe CPU → lent. Timeout crescut de la 60s la 180s. Adăugat și `OLLAMA_CATEGORIZE_MODEL` în config — dacă vrei un model mai mic doar pentru categorization fără să afectezi chat-ul.

**SmartCategorizer cu date vechi:**
Mapările vechi (`'Home'`, `'personal'`, `'groceries'`) veneau din sesiuni de onboarding cu un sistem vechi de categorii. Deși AB are acum exact `'Home'`, `'Personal'`, `'Groceries'`, mapările cu casing greșit treceau prin fuzzy match și uneori dădeau rezultate surprinzătoare. Șterse manual — SmartCategorizer se repopulează corect prin confirmări de import.

### De reținut
- **Ollama poate salva profiluri greșite** — mereu verifică ce e în SQLite după un import pe format necunoscut: `docker exec majordom-api python3 -c "import sqlite3; conn = sqlite3.connect('/app/data/memory.db'); [print(r) for r in conn.execute('SELECT source_name, col_merchant FROM csv_profiles').fetchall()]"`
- **SmartCategorizer ≠ date financiare** — stochează preferințe (`Albert Heijn → Groceries`), nu tranzacții. E un cache de performanță, nu o sursă de adevăr. AB rămâne sursa de adevăr pentru tot ce e financiar.
- **SmartCategorizer se populează din confirmări de import** — după câteva importuri confirmate, recunoaște automat toți comercianții fără LLM. Dacă datele sunt vechi/greșite, șterge tot: `conn.execute('DELETE FROM merchant_mappings')`
- **`logging.getLogger(__name__)` nu apare în docker logs** dacă root logger-ul nu e configurat — pentru debug rapid în container folosește `print(..., flush=True)` sau verifică direct cu `docker exec`

---

## 2026-05-30 — Setup flow inline + bug `decimal_to_cents` + balance adjustment din chat

### Problema

Trei lucruri defecte în același timp:
1. Popupul de setup al soldurilor arăta diferit față de restul UI-ului (modal overlay, nu card inline)
2. Modificările de sold nu apăreau în Actual Budget
3. Nu exista nicio comandă chat pentru a sincroniza soldul din AB cu cel real după prima configurare

### Ce s-a întâmplat

**Bug `decimal_to_cents` — suma greșită la ajustare sold:**

`create_transaction()` din actualpy convertește intern suma din EUR în cenți prin `decimal_to_cents()`. Funcția face pur și simplu `×100`.

```python
# decimal_to_cents(47.50)  → 4750  ✓ (EUR → cenți)
# decimal_to_cents(873)    → 87300 ✗ (dacă pasezi cenți, devine ×100 din nou)
```

`adjust_account_balance()` calcula diferența în cenți (`diff_cents = target_cents - current_cents`), dar o pasa direct la `create_transaction(amount=diff_cents)` — care o multiplica iar cu 100. O ajustare de €8.73 devenea €873 în AB.

Fix: trecut din cenți în EUR înainte de apelul `create_transaction`:
```python
diff_euros = diff_cents / 100
create_transaction(..., amount=diff_euros, ...)
return diff_euros
```

**Modal vs card inline:**

`SetupBalancesModal` era un overlay cu fundal semi-transparent care acoperea tot ecranul — vizual diferit de restul cardurilor din chat (ProposalCard, ClarificationCard). Înlocuit cu `SetupBalancesCard` — aceeași structură ca ProposalCard (`bg-surface border border-border rounded-2xl rounded-bl-sm max-w-[85%]`), inserat inline în lista de mesaje, nu ca popup.

**`_PROPOSAL_TOOLS` — gotcha critic pentru tool-uri noi:**

La implementarea `propose_balance_adjustment`, DeepSeek putea să uite să adauge tool-ul în `_PROPOSAL_TOOLS` din `chat.py`. Dacă e absent, JSON-ul cardului e retrimis la LLM în loc să fie returnat direct frontend-ului. Orice tool `propose_*` nou **trebuie** adăugat acolo:

```python
# backend/api/chat.py
_PROPOSAL_TOOLS = {
    "propose_transaction",
    "propose_budget_rebalance",
    "propose_account_transfer",
    "propose_clarification",
    "propose_balance_adjustment",  # ← fără asta, cardul nu apare niciodată
}
```

### Soluția

- `adjust_account_balance` — fix unitate (EUR, nu cenți)
- `SetupBalancesModal` → `SetupBalancesCard` inline în chat
- `propose_balance_adjustment` tool nou: LLM caută contul după nume (exact + parțial), calculează diff, returnează card cu sold curent / sold real / diferență. Confirm → `adjust_account_balance` în AB
- Cardul de ajustare nu primește categorie — intenționat. AB va afișa tranzacția ca „needs category" — utilizatorul decide ce este (cheltuială uitată, transfer neînregistrat, eroare)

### De reținut
- **`create_transaction()` din actualpy primește EUR, nu cenți** — conversia la cenți e internă. Dacă calculezi în cenți și pasezi cenți, rezultatul e ×100 greșit.
- **Orice `propose_*` tool nou → adaugă-l în `_PROPOSAL_TOOLS`** din `backend/api/chat.py` imediat, altfel cardul nu ajunge la frontend.
- **UI în chat = inline, nu modal** — popupurile cu overlay sunt inconsistente cu tema. Tot ce apare ca răspuns al asistentului trebuie să fie un card inline, stilizat ca ProposalCard.
