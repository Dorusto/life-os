# Contributing to Majordom

Thank you for your interest in contributing. Majordom is a self-hosted personal finance assistant — the goal is to keep it simple, private, and genuinely useful for real families.

---

## Vision

Majordom is planned as three modules, built incrementally:

| Module | Status | Description |
|--------|--------|-------------|
| **Financial** | ✅ Active | Receipts, CSV import, budgeting, Actual Budget integration |
| **Wellness** | Planned | Sleep, exercise, nutrition — self-hosted, no wearable required |
| **Digital** | Planned | Screen time, focus goals, digital habits |

Most contributions right now will land in the Financial module.

---

## How to contribute

### What's most needed

- **New CSV bank formats** — if your bank's CSV export isn't detected, add a profile
- **Bug fixes** — especially around receipt OCR edge cases and CSV parsing
- **Translations** — merchant keyword lists in `categories.json` for new regions
- **Documentation** — setup guides, troubleshooting, video walkthroughs
- **New features** — see the roadmap in [ROADMAP.md](ROADMAP.md)

### What we're not looking for (yet)

- Rewrites of working code "just to clean it up"
- New dependencies that require cloud services
- Features that compromise the self-hosted / zero-cloud principle

---

## Local development setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker + Docker Compose
- Ollama running locally (or point to a remote instance)

### Backend

```bash
cd majordom-financiar

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.backend.txt

# Copy and fill in environment variables
cp .env.example .env
# edit .env — at minimum set ACTUAL_BUDGET_*, JWT_SECRET, USER1_*

# Run the API
PYTHONPATH=. uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # starts on :5173, proxies /api to :8000
```

### Telegram bot (optional)

```bash
pip install -r requirements.bot.txt   # if separate, otherwise already installed
python3 -m bot.main
```

### Full stack with Docker

```bash
docker compose up --build
```

---

## Adding a new CSV bank format

If Ollama can't detect your bank's CSV format, you can add a profile manually:

1. Export a sample CSV from your bank (at least 5 rows, remove real amounts)
2. Open an issue with the header row and 2-3 example rows (sanitized)
3. Or: add a profile to `backend/core/csv_importer/profiles.py` and open a PR

The profile system uses a header-signature hash for instant detection on future imports — Ollama is only called once per unknown format.

---

## Before opening a PR

- [ ] The existing tests pass (`pytest` from repo root)
- [ ] New backend code has type hints
- [ ] No new cloud service dependencies introduced
- [ ] Docker Compose still builds: `docker compose build`
- [ ] If you changed the `.env.example`, document the new variable in README.md

---

## Code style

- Python: [Ruff](https://github.com/astral-sh/ruff) for linting (`ruff check .`)
- TypeScript: ESLint + Prettier (config in `frontend/`)
- Commit messages: `feat:`, `fix:`, `docs:`, `refactor:` prefixes preferred

---

## Opening issues

Use the issue templates — they ask for the right information upfront and save everyone time.

---

*Majordom is built with AI assistance (Claude + DeepSeek). Contributions from humans and AI are both welcome, as long as the code works and the principle stays the same: your financial data stays on your server.*
