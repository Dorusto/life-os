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

*Ultima actualizare: 2026-04-11 (sesiunea 3)*
