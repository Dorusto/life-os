# Sovereign Life OS

> *Your life. Your data. Your rules.*

A self-hosted personal operating system built on your own hardware, powered by local AI.
No cloud. No subscriptions. No one else's server.

---

## What is this?

Most people pay 15+ subscriptions to services that profit from their personal data — budgeting apps, fitness trackers, photo storage, media libraries. Sovereign Life OS replaces all of them with open-source tools running on your own hardware.

One server. Your data. Zero recurring costs.

---

## Three Majordoms, One System

The system is built around three autonomous assistants ("Majordomii"), each managing a different area of your life:

### 🏦 Majordom Financiar *(active development)*
Your personal CFO, running locally.

- Send a receipt photo on Telegram → AI extracts the data → saved automatically
- Natural language commands: *"what did I spend this week?"*, *"show my balance"*
- Full integration with [Actual Budget](https://actualbudget.org/) for budgeting and reporting
- Powered by [Ollama](https://ollama.com/) with a local vision model — no data leaves your server

**Stack:** Python · python-telegram-bot · Ollama (qwen2.5vl) · Actual Budget · Docker

### 🏃 Majordom Wellness *(planned)*
Movement, nutrition and health — monitored and personalized.

- Food journal via Telegram (free text → AI → macros)
- Activity tracking (Garmin/GPX import)
- Health metrics over time
- Integration with Home Assistant for smart sensors

### 🏛️ Majordom Digital *(planned)*
Your personal digital vault and home automation hub.

- Self-hosted photo management (Immich)
- Document archive with full-text search (Paperless-ngx)
- Media library (Jellyfin)
- Home automation and energy monitoring (Home Assistant)
- Search your own archive via Telegram: *"find the lease contract"*

---

## Quick Start — Majordom Financiar

### Requirements
- Docker & Docker Compose
- [Ollama](https://ollama.com/) running locally or on your network
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- [Actual Budget](https://actualbudget.org/) self-hosted instance

### Setup

```bash
git clone https://github.com/Dorusto/life-os.git
cd life-os/majordom-financiar
cp .env.example .env
# Edit .env with your credentials
docker-compose up -d
```

See `.env.example` for all required configuration values.

---

## Philosophy

This project is built on the belief that personal data should stay personal.
Every service here runs on your hardware, with open-source software, controlled entirely by you.

The name "Majordom" comes from the Romanian word for *majordomo* — the trusted household manager who keeps everything running smoothly, behind the scenes.

---

## Status

| Module | Status |
|---|---|
| Majordom Financiar | 🔄 Active development |
| Majordom Wellness | 📋 Planned |
| Majordom Digital | 📋 Planned |

---

## License

MIT — use it, modify it, make it your own.
