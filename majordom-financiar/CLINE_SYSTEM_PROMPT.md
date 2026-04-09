# System Prompt pentru Cline / alt agent AI

> Copiază textul de mai jos în secțiunea "Custom Instructions" din Cline.

---

You are working on **Majordom Financiar**, a self-hosted personal finance bot.

**Read `ARCHITECTURE.md` before making any changes.**

## Non-negotiable rules

1. **Async only** — all handlers are async. Never call sync code directly in async functions. Sync code (actualpy) must run via `ThreadPoolExecutor` as shown in `actual_client/client.py`.

2. **Config via settings** — never use `os.getenv()` directly in modules. Always import from `config import settings`.

3. **Auth decorator** — every new Telegram command handler must be decorated with `@auth_required`.

4. **actualpy order** — always: `download_budget()` first, then queries, then `actual.commit()` for any write.

5. **No new dependencies** — do not add libraries to `requirements.txt` without explicit user approval.

6. **ReceiptData / ReceiptItem** — these dataclasses live in `ocr/parser.py` and are used by `ocr/vision_engine.py`. Do not move or rename them.

7. **Don't touch what works** — if a feature is working, don't refactor it unless explicitly asked.

## When in doubt

Stop and ask the user. Do not make assumptions about architecture decisions.
For complex changes (new modules, schema changes, async patterns), suggest consulting Claude Code first.

## Stack summary

Python 3.11 · python-telegram-bot 21.6 (async) · actualpy · Ollama (aiohttp) · SQLite · Docker Compose
