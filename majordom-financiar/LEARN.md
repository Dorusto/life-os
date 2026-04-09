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
├── transactions   ← istoricul: merchant, amount, category, date
└── budget_limits  ← limitele setate cu /setup_budget
```

### Cum sugerează categoria (TF-IDF simplu)
Algoritmul nu e magic — e matematică simplă:

1. Ia textul bonului: "Kaufland supermarket"
2. Îl rupe în cuvinte: ["kaufland", "supermarket"]
3. Caută în istoricul tău ce categorie ai dat pentru "kaufland" în trecut
4. Categoria care apare cel mai des cu acele cuvinte → câștigă

```
"kaufland" → a apărut de 15 ori cu categoria "Alimente" → scor mare
"kaufland" → a apărut de 2 ori cu categoria "Îmbrăcăminte" → scor mic
→ Sugestie: "Alimente" cu 87% încredere
```

**Pragul de 0.8 (80%):** dacă e mai sigur de 80%, categorizează automat fără să
te întrebe. Sub 80% → îți arată opțiuni. Poți schimba din `.env`:
```
CATEGORIZE_AUTO_THRESHOLD=0.9  # mai conservator, te întreabă mai des
CATEGORIZE_AUTO_THRESHOLD=0.6  # mai agresiv, mai puține întrebări
```

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

---

*Dacă un concept tot nu e clar după ce l-ai citit, întreabă — nu lăsa nelămuriri acumulate.*
