---
title: Reference — FAQ & Glossary
description: Common questions and key terms for Majordom Finance.
---

## Frequently Asked Questions

### Where is my data stored?

The primary source of truth for all your financial data (transactions, accounts, categories, budgets) is **Actual Budget**, which runs on your own server inside a Docker container. Majordom never stores financial data in its own database — only conversational context and user preferences (learned category mappings, push-subscription tokens) are kept in a local SQLite file. Your data never leaves your machine.

### Do I need to learn Actual Budget?

No. You interact with Majordom — it handles everything under the hood. Actual Budget is there if you ever want to open it directly (port :5006 on your server), but you never have to. All categorising, transferring, and budgeting happens through Majordom’s chat interface.

### Why does Actual Budget show a “Fatal Error: SharedArrayBuffer”?

Actual Budget runs a full SQLite engine in the browser (WebAssembly), which only works in a **secure context** — `https://` or `localhost`. Opening it via a plain `http://` LAN or server IP triggers this error. Use `https://`, or set up an SSH tunnel.

### Why is a transaction uncategorized?

A transaction that hasn’t been matched by a rule or confirmed by you is left uncategorized. You can see them grouped by payee under the **Uncategorized** chip on the Home screen, or ask Majordom in chat — it will propose categories for you to confirm.

### What happens if I import the same CSV twice?

Duplicates are detected automatically and skipped. Majordom generates a SHA‑256 hash of the date + merchant + amount and passes it to Actual Budget as the transaction’s imported ID. If a transaction with that hash already exists, the duplicate is silently ignored — no harm done.

### Why does a widget say “coming soon” or “not built”?

Some settings screens and widgets are deliberate placeholders. They mark functionality that hasn’t been built yet, rather than showing something misleading. They are not bugs.

### Can I use a cloud LLM instead of the local model?

Yes. By default Majordom runs a local Ollama model (~7 GB download), but you can switch to a cloud provider (OpenRouter, DeepSeek, or any OpenAI‑compatible API) by changing `LLM_BASE_URL` and `LLM_API_KEY` in your `.env` file. See the **Self-Hosting** section of the README for details.

### How do I change the theme?

Today only **Dark** is available. Light and System are listed in the Appearance settings but marked as “Not built”. This is a deliberate choice — Majordom’s UI is currently dark‑only.

### How do I get a daily summary?

Enable **push notifications** in the Notifications settings screen. Once granted, the daily digest is sent every day at 20:00 and cannot be turned off — it’s always on. The digest includes a summary of your spending, import reminders, and any pending items that need your attention.

---

## Glossary

| Term | Definition |
|------|------------|
| **Actual Budget** | The open‑source budgeting application that Majordom uses as its financial data engine. All transactions, accounts, categories, and budgets live in Actual Budget. |
| **On‑budget / Off‑budget** | An **on‑budget** account is included in budget calculations (its transactions affect category budgets). An **off‑budget** account (e.g. a tracking account for investments) is visible but its transactions don’t affect the budget. |
| **Category group** | A container for related categories (e.g. “Personal”, “Bills”). Groups help organise your budget but don’t affect calculations. |
| **Payee** | The entity a transaction is with (e.g. a merchant). Majordom learns your payees over time and can auto‑categorise future transactions with the same payee. |
| **Schedule** | A recurring transaction that repeats on a regular interval. Majordom can propose creating a schedule when it detects a repeating pattern, and also suggest deactivating one that appears overdue. |
| **Transfer** | A movement of money between two accounts. In Actual Budget a transfer is represented as two linked transactions — one in each account. Majordom handles the linking automatically. |
| **Duplicate / Near‑duplicate** | A pair of transactions that share the same date, merchant, and amount. Majordom detects exact duplicates (skipped on re‑import) and near‑duplicates (similar but not identical, e.g. a small difference in amount) for you to review and merge. |
| **Budget period** | The time window used for budget calculations — a single calendar month. Majordom’s Annual Budget Pacing feature tracks discretionary spending against your yearly income minus fixed costs. |
| **Goal** | A savings target tied to an account (e.g. “save €5000 for a car by 2028”). Majordom tracks progress against the balance and can propose monthly contributions to keep you on track. |
| **FIRE** | Financial Independence / Retire Early. Majordom calculates your FIRE number (25× your yearly spending) and shows your progress toward it on the Home screen, along with estimated retirement year. |
| **Expense coverage** | The percentage of your monthly expenses that could be covered by passive or semi‑passive income. Calculated from income sources you’ve classified as passive. |
| **Net worth** | Total assets minus total liabilities across all your accounts. Majordom computes this from Actual Budget’s data, excluding starting‑balance transactions to avoid inflation. |
| **Proposal card** | An interactive card in chat that displays a proposed action (e.g. “Add transaction — €45 at Lidl”) with Confirm and Cancel buttons. Every write operation goes through this pattern. |
| **Clarification card** | A card that asks you to choose from a set of options when the intent of your request is ambiguous. Selecting an option sends a new message to the assistant. |
| **Status line** | A grey italic line shown after a proposal is confirmed or cancelled, indicating the outcome without leaving a card in the chat. |
| **Sync ID** | A unique identifier from Actual Budget’s *Settings → Advanced* page. Majordom uses it to identify which budget file to sync with. Set it in `.env` under `ACTUAL_BUDGET_SYNC_ID`. |
