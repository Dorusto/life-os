# Majordom — Personal Finance Assistant

**Majordom is not a finance app. It's a conversational intelligence layer over powerful tools (Actual Budget, Sure) that makes them accessible without you ever having to learn them.**

You talk to Majordom. Majordom does everything else — in the background, on your own server, with your data staying yours.

> Built with AI assistance (Claude + DeepSeek). Co-authored by a human who understands ~3% of the code and an AI that wrote the rest.

---

## Why Majordom exists

Most budgeting apps give you dashboards and expect you to draw conclusions. Majordom draws the conclusions for you — and acts on them.

You don't learn Actual Budget. You don't configure categories. You don't set up rules. You talk to Majordom in plain language and it handles everything underneath: categorising transactions, detecting patterns, proposing rebalances, tracking goals, and alerting you before problems happen — not after.

**What makes it different from YNAB or Monarch Money:**

| | Majordom | YNAB / Monarch |
|--|----------|----------------|
| Data ownership | Self-hosted, your server | Cloud, their servers |
| Behaviour | Proactive — initiates, alerts, acts | Reactive — shows what happened |
| Setup | Conversational — no wizard, no forms | Form-based onboarding |
| Extensibility | Add any tool without changing the UX | Closed ecosystem |

---

## What changes after 3 months

> *"After 3 months, you'll have a clear picture of where your money goes and where you could save or rebalance to reach your goals. You'll make more rational spending decisions, aligned with your personal objectives. You'll have a long-term investment strategy with a clear view of your investor profile. And you'll know, with real precision, when you can reach financial independence — and what you can do to get there faster.*
>
> *Majordom will already know your goals and will keep you updated without you having to ask."*

---

## What it does

| Action | Result |
|--------|--------|
| 📷 Photograph a receipt | AI extracts merchant, amount, date → you confirm → saved to Actual Budget |
| 📄 Import a CSV bank export | Auto-detects format → shows preview → you set categories → saved to Actual Budget |
| 🏦 Automatic bank sync | Enable Banking open-banking connection — tested live with ING NL |
| 💬 Chat with the assistant | Ask questions about your spending, balances, and categories |
| 📊 Dashboard | Monthly spending by category (donut chart) + recent transactions |
| 🚗 Vehicle log *(optional)* | Fuelio replacement — fuel log, refuel from photos, APK/insurance reminders |
| 🎯 Savings goals & FIRE | Progress bars, monthly-needed calculation, financial-independence timeline on Home |
| 🔔 Proactive alerts | Budget overspend, income variance, goal risk — pushed to you, not buried in a dashboard |

**Everything runs on your own server. Zero cloud. Zero subscriptions.**

---

## Prerequisites

- A machine that runs 24/7 (Linux recommended — Raspberry Pi, NAS, home server, VPS)
- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/install/)
- ~7 GB disk for the AI model (downloaded automatically on first start)
- 16 GB RAM recommended if running the local Ollama model on CPU (8 GB can be tight)
- NVIDIA GPU is optional but speeds up receipt scanning (~3s vs ~60s on CPU)

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Dorusto/life-os.git
cd life-os/majordom-financiar
```

### 2. Configure

```bash
cp .env.example .env
nano .env
```

Fill in the required values:

| Variable | What to set |
|----------|-------------|
| `USER1_USERNAME` / `USER1_PASSWORD` | Your web UI login credentials |
| `USER2_USERNAME` / `USER2_PASSWORD` | Second user (spouse, partner) — delete if not needed |
| `JWT_SECRET` | Run: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ACTUAL_BUDGET_PASSWORD` | Choose any password for Actual Budget |
| `WEB_PORT` | Port for the web UI (default: `3000`) |

Leave Ollama and Actual Budget URLs as-is if running everything with Docker Compose (the defaults point to internal container names).

### 3. Start the services

```bash
docker compose --profile ollama-local up -d
```

This starts:
- **actual-budget** — open-source budget app (`:5006`)
- **ollama** — local AI for receipt OCR and chat (downloads the model automatically, ~7 GB)
- **majordom-api** — FastAPI backend
- **majordom-web** — React web app (`:3000` or your `WEB_PORT`)
- **sqlite-web** — database viewer (`:8888`)

First start takes 5–10 minutes while Ollama downloads the AI model.

Already have an Ollama server running elsewhere on your network (or use OpenRouter/DeepSeek instead)? Set `LLM_BASE_URL` in `.env` to point to it, then start without the profile: `docker compose up -d` — this skips the local Ollama container entirely.

**Optional: vehicle/fuel tracking.** Add `--profile vehicle-manager` to the command above to also start the vehicle-manager service (`vehicle-manager` + `vehicle-manager-sqlite-web` on `:8889`) — a Fuelio-replacement companion app. Skip it if you don't need vehicle tracking; the rest of Majordom works fully without it.

### 4. Set up Actual Budget

> **Browser requirement:** Actual Budget runs a full SQLite engine in-browser (WebAssembly), which only works in a *secure context* — `https://` or `localhost`. Opening it via a plain `http://` LAN/server IP (e.g. `http://192.168.1.50:5006`) shows a **"Fatal Error: SharedArrayBuffer"** screen. If you're not already accessing your server over HTTPS or Tailscale, use an SSH tunnel for this step: `ssh -L 5006:localhost:5006 your-server` from your own machine, then open `http://localhost:5006`.

1. Open `http://your-server:5006` (see the note above if this shows a Fatal Error)
2. Create a new budget file (name doesn't matter)
3. Go to **Settings → Advanced** → copy the **Sync ID**
4. Add it to `.env`:
   ```
   ACTUAL_BUDGET_SYNC_ID=paste-your-sync-id-here
   ```
5. Apply it — **`restart` does NOT pick up new `.env` values**, only `up -d` recreates the container with them:
   ```bash
   docker compose up -d majordom-api
   ```

### 5. Open the web app

Go to `http://your-server:3000` (or whatever `WEB_PORT` you set).

Log in with the credentials from your `.env` (`USER1_USERNAME` / `USER1_PASSWORD`).

---

## Usage

### Web UI (primary interface)

| Screen | How to access | What it does |
|--------|---------------|--------------|
| **Home** | Default screen | Recent transactions, monthly spending chart, receipt scan button |
| **Import** | Bottom nav → Import | Upload CSV bank export → preview → set categories → confirm |
| **Chat** | Bottom nav → Chat | Ask the AI about your finances |

**Scanning a receipt:**
1. On the Home screen, tap the camera button
2. Take or upload a photo of the receipt
3. Review the extracted data (merchant, amount, date, category)
4. Confirm → saved to Actual Budget

**Importing a CSV:**
1. Export transactions from your bank as CSV (ING, Rabobank, crypto.com, Revolut, or any format Ollama can figure out)
2. Go to Import → drop the CSV file
3. Review rows, set categories, pick the account
4. Confirm → saved to Actual Budget

Duplicate detection is automatic — re-importing the same CSV is safe.

---

## Categories

12 built-in categories:

🛒 Groceries · 🍽️ Restaurants · 🚗 Transport · 💡 Utilities · 💊 Health · 👕 Clothing · 🏠 Home & Maintenance · 🎬 Entertainment & Travel · 👨‍👩‍👧‍👦 Children · 💰 Personal · 📈 Investments & Savings · 📦 Other

The assistant learns: once you confirm a category for a merchant, that merchant is auto-categorized on every future import.

---

## Multi-user

Add multiple users in `.env`:

```env
USER1_USERNAME=partner1
USER1_PASSWORD=...
USER2_USERNAME=partner2
USER2_PASSWORD=...
```

---

## Architecture

```
majordom-financiar/
├── backend/
│   ├── api/           # FastAPI routes (auth, receipts, transactions, CSV import, chat)
│   ├── services/      # Business logic (receipt processing)
│   └── core/
│       ├── actual_client/   # Async wrapper for Actual Budget
│       ├── csv_importer/    # CSV parsing, format detection, normalization
│       ├── memory/          # SQLite: learned categories, CSV profiles
│       ├── ocr/             # AI vision via Ollama
│       └── config/          # Settings (loaded from .env)
├── frontend/          # React + Vite + Tailwind (PWA)
├── scripts/           # Ollama entrypoint, dev helpers
├── data/              # SQLite DB + uploaded images (Docker volume)
├── docker-compose.yml
├── Dockerfile.backend
└── .env
```

The optional `vehicle-manager` service (`--profile vehicle-manager`) lives one level up, at `../tools/vehicle-manager` — it's a sibling directory in the same `life-os` clone, not inside `majordom-financiar/`.

**Tech stack:** Python 3.11 · FastAPI · React 18 · Vite · TypeScript · Tailwind CSS · Ollama (qwen3.5:9b — vision + chat + reasoning) · Actual Budget · SQLite · Docker Compose

---

## Troubleshooting

**Web app shows blank or "Cannot connect"**
```bash
docker compose logs majordom-api --tail=50
docker compose logs majordom-web --tail=20
```

**Receipt scanning is slow (~60s)**
Normal on CPU. If you have an NVIDIA GPU, add GPU access to the `ollama` service in `docker-compose.yml` — the configuration is already there, just verify your NVIDIA Container Toolkit is installed.

**"No account found" error**
Complete Actual Budget setup (step 4 above) and verify `ACTUAL_BUDGET_SYNC_ID` is set in `.env`.

**Ollama models not downloading**
```bash
docker compose logs ollama --tail=50
```
The first start downloads ~7 GB. Check your disk space and internet connection. Also make sure the LXC/VM has enough RAM (16 GB recommended) — qwen3.5:9b is noticeably heavier than the older 7B model pair.

**Check service health:**
```bash
docker compose ps
```
All services should show `healthy` before the app works correctly.

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full roadmap with implementation details, database schemas, and priorities.

Short version of what's coming:
- Document Management — scan invoices, warranties, vehicle docs, insurance policies
- Vehicle consumption/cost charts and cross-vehicle comparison (the fuel log itself already works, see above)
- Investment portfolio tracking (Sure) — budget/investments integration in progress
- Extract vehicle tracking into its own independent service (internal modularity, REST + MCP)

---

## Built with

- [Actual Budget](https://actualbudget.org/) — open source budgeting
- [Ollama](https://ollama.ai/) — local AI inference
- [actualpy](https://github.com/bvanelli/actualpy) — Python client for Actual Budget
- [FastAPI](https://fastapi.tiangolo.com/) — async Python web framework
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [Tailwind CSS](https://tailwindcss.com/)

---

*Self-hosted. Your data stays yours.*

---

## Project status

Personal project in active development. External contributions are not prioritized at this stage.

