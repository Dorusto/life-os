# Majordom — Personal Finance Bot

A self-hosted Telegram bot that turns receipts and bank exports into a clean, categorized budget — without sending your financial data to any cloud service.

> Built with AI assistance (Claude). Co-authored by a human who understands ~3% of the code and an AI that wrote the rest.

---

## What it does

| Action | Result |
|--------|--------|
| 📷 Send a receipt photo | AI extracts merchant, amount, date → asks for category → saves to Actual Budget |
| 📎 Send a CSV bank export | Auto-detects format (ING, crypto.com, Revolut…) → imports all transactions → asks category for unknown merchants |
| ✅ Confirm a category | Bot learns: next time same merchant is auto-categorized |
| 💬 `/add 49.99 Uber` | Manually add a transaction |
| 📊 `/balance` `/stats` | Current balance and monthly spending by category |

**Everything runs on your own server. Zero cloud. Zero subscriptions.**

---

## Prerequisites

- A server, NAS, or PC that runs 24/7 (Linux recommended)
- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/install/)
- A Telegram account
- A GPU is optional but speeds up receipt scanning (CPU works fine, ~60s/image)

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Dorusto/life-os.git
cd life-os/majordom-financiar
```

### 2. Create your Telegram bot

1. Open Telegram → search for **@BotFather**
2. Send `/newbot` → follow the instructions
3. Copy the **bot token** (looks like `123456789:ABCdef...`)

### 3. Find your Telegram user ID

1. Open Telegram → search for **@userinfobot**
2. Send `/start`
3. Copy the **Id** number shown

### 4. Configure

```bash
cp .env.example .env
nano .env  # or any text editor
```

Fill in at minimum:
- `TELEGRAM_BOT_TOKEN` — from step 2
- `TELEGRAM_ALLOWED_USER_IDS` — from step 3
- `ACTUAL_BUDGET_PASSWORD` — choose any password

### 5. Start

```bash
docker compose up -d
```

This starts three services:
- **actual-budget** — the budget app (open `http://your-server:5006` to set it up)
- **ollama** — local AI for receipt scanning (downloads model automatically, ~2GB)
- **majordom-bot** — the Telegram bot

### 6. Set up Actual Budget

1. Open `http://your-server:5006` in your browser
2. Create a new budget file with any name
3. Go to **Settings → Advanced** → copy the **Sync ID**
4. Add it to your `.env`:
   ```
   ACTUAL_BUDGET_SYNC_ID=paste-your-sync-id-here
   ```
5. Restart the bot:
   ```bash
   docker compose restart majordom-bot
   ```

### 7. Test it

Open Telegram, find your bot, send `/start`. You should get a welcome message.

---

## Usage

### Receipt photo
Send any photo of a receipt. The bot will extract the data and ask you to confirm or change the category. After confirmation, it's saved to Actual Budget.

### CSV bank export
Export transactions from your bank as CSV and send the file directly to the bot. Supported banks: **ING** (Netherlands), **crypto.com**, Revolut, and any bank whose CSV format Ollama can figure out.

First time sending a new format: the bot shows the detected column mapping for your confirmation. After that, it's remembered.

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + feature overview |
| `/add 49.99 Kaufland groceries` | Add a transaction manually |
| `/balance` | Show current account balances |
| `/stats` | Monthly spending by category |
| `/stats 3 2025` | Spending for a specific month |
| `/categories` | List all categories |
| `/help` | Full help |

---

## Categories

12 default categories (edit `config/categories.json` to customize):

🛒 Groceries · 🍽️ Restaurants · 🚗 Transport · 💡 Utilities · 💊 Health · 👕 Clothing · 🏠 Home & Maintenance · 🎬 Entertainment & Travel · 👨‍👩‍👧‍👦 Children · 💰 Personal · 📈 Investments & Savings · 📦 Other

Each category has keywords for common merchants. When you confirm a category for a merchant, it's remembered permanently.

---

## Multi-user (family)

Add multiple Telegram user IDs separated by commas:
```
TELEGRAM_ALLOWED_USER_IDS=422151041,987654321
```

To find someone's ID: they send `/start` to @userinfobot.

---

## Architecture

```
majordom-financiar/
├── bot/              # Telegram handlers, CSV wizard, keyboards
├── ocr/              # AI vision via Ollama (receipt → structured data)
├── csv_importer/     # CSV parsing, format detection, normalization
├── actual_client/    # Async wrapper for Actual Budget API
├── memory/           # SQLite: transaction history, learned categories, CSV profiles
└── config/           # Settings, categories
```

Tech stack: Python 3.11 · python-telegram-bot v21 · Ollama (qwen2.5vl) · Actual Budget · SQLite · Docker

Full technical documentation: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Troubleshooting

**Bot doesn't respond**
```bash
docker compose logs majordom-bot --tail=50
```

**Receipt scanning is slow (~60s)**
Normal on CPU. If you have an NVIDIA GPU, Ollama will use it automatically if the container has GPU access configured in `docker-compose.yml`.

**"No account found" error**
Complete the Actual Budget setup (step 6) and make sure `ACTUAL_BUDGET_SYNC_ID` is set correctly in `.env`.

**Duplicate transactions after CSV import**
Re-importing the same CSV is safe — duplicates are detected via SHA256 hash and skipped automatically.

---

## Roadmap

- [ ] `/setup` wizard — guided onboarding through Telegram
- [ ] Category management via bot commands (no JSON editing)
- [ ] Automatic bank sync via open banking (GoCardless/Nordigen)
- [ ] Monthly summary report sent automatically on the 1st
- [ ] Ghostfolio integration for investment portfolio tracking

---

## Built with

- [python-telegram-bot](https://github.com/python-telegram-bot/python-telegram-bot)
- [Actual Budget](https://actualbudget.org/) — open source budgeting
- [Ollama](https://ollama.ai/) — local AI inference
- [actualpy](https://github.com/bvanelli/actualpy) — Python client for Actual Budget

---

*Self-hosted. Your data stays yours.*
