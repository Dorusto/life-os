---
title: Settings
description: Browse and configure Majordom settings — themes, accounts, categories, notifications, and more.
---

The Settings screen is where you manage your Majordom experience. It is divided into a menu of
sub‑pages, each covering a different area of the app.

All rows that look clickable are interactive; rows that look inert (no chevron, no toggle) are
placeholders for future features that haven’t been built yet. The page marks them clearly so you
are never misled.

Because the app is currently dark‑theme only, all screens follow that appearance by default.

---

## Menu overview

The Settings menu is split into groups:

| Group | Sub‑pages |
|---|---|
| **Personal** | Appearance, Language, General, Security & Backup |
| **Workspace** | Currencies, Categories, Payees, Scheduled Payments, Import & Export, AI, AI Integrations, Annual Budget Pacing |
| **Connections** | Links to external services |
| **Notifications** | Push and daily digest controls |
| **About** | Version info and a placeholder disconnect row |

There is also a **Sync accounts** button at the top and a **Log out** button at the bottom.

### Sync accounts

Tap **Sync accounts** to pull the latest transactions from every connected bank feed. This
refreshes the dashboard, account list, and any pending review views. While syncing the button
shows a spinner; if it fails it shows “Sync failed — tap to retry.”

### Log out

Tap **Log out** at the bottom to clear your credentials and return to the login screen.

---

## Personal

### Appearance

Only **Dark** is available. Light and System modes are not built.

- **Dark** — already active (shown with a checkmark)
- **Light** — not built
- **System** — not built

### Language

**English** is the only language. The app is English‑only by project convention.

### General

All three rows are placeholders (they have no chevron or toggle):

- Default account
- Include credit limits in balance
- Show archived accounts

None of them do anything today.

### Security & Backup

- **Change password** — placeholder, not built
- **Active session** — shows “This device” (always)
- **Last backup** — live status of your last backup timestamp (or “Unknown” if none)
- **Run backup now** — placeholder
- **Restore from backup** — placeholder

All actions except the last‑backup status are inert.

---

## Workspace

### Currencies

Actual Budget tracks one currency per budget file, not per account. There is no per‑account
currency data to show. The sub‑page displays an explanatory note.

### Categories

Shows a live count of **categories** and **groups** (e.g. “12 categories · 4 groups”). Tap
**Open in Majordom chat** to start a conversation about your category structure. Use the chat
to rename, merge, create, or delete categories.

### Payees

A live list of every payee in your budget, sorted alphabetically. Each row shows the payee
name and the number of transactions associated with it.

### Scheduled payments

A live list of every recurring schedule. Each row shows the schedule name and whether it is
**Active** or **Inactive**.

### Import & Export

**Import CSV** opens a conversation in the chat screen, where you can upload a CSV file and
review its rows before confirming. **Export transactions** is a placeholder and does nothing yet.

### AI

Displays the three currently configured model endpoints (read‑only):

- **Chat** — `deepseek/deepseek-chat`
- **Vision** — `google/gemini-2.5-flash-lite`
- **Local fallback** — `qwen3.5:9b`

Models run via OpenRouter with a local Ollama fallback. They are not editable from this screen.

### AI Integrations

The single row **MCP server — Inbound — not built yet** is a placeholder, marked as a future
roadmap item.

### Annual budget pacing

This is a real, interactive editor for the annual budget‑pacing feature. It helps you track
discretionary spending against your annual income, after accounting for fixed expenses and
sinking funds.

**Fields:**

- **Annual income (€)** — the total yearly income you expect (after tax)
- **Fixed expense categories** — toggle categories that are the same amount every month (e.g.
  rent, insurance). These are subtracted from your annual income before pace is calculated.
- **Sinking fund / goal categories** — toggle categories you are saving toward gradually
  (e.g. vacation, car repair). These are also subtracted.

**Important:** A category can be either *fixed* or *sinking fund*, never both. If you toggle a
category that is already in the other set, it is automatically moved. This mutual‑exclusion
rule is enforced in the UI to keep the calculations correct.

Tap **Save** to persist your configuration. A success or error message appears below the form.

---

## Connections

Opens external services in separate browser tabs:

- **Actual Budget** — the underlying budgeting tool (connected)
- **Vehicle Manager** — fuel‑logging and maintenance tracker (connected)
- **Investment Manager** — portfolio tracker (connected)
- **Majordom Memory** — local‑only SQLite viewer of the app’s internal data (localhost only)

All links open in a new tab.

---

## Notifications

### Push notifications

Controls browser‑based push notifications:

- **Enabled** — you have granted permission. Tap the row to re‑subscribe (e.g. after clearing
  your backend data). This will update the browser subscription silently.
- **Blocked** — the browser has denied permission. Follow your browser’s site‑settings dialog
  to re‑enable it. Tapping the row does nothing while permission is denied.
- **Not supported** — your device or browser doesn’t support push. The row is greyed out.

### Daily digest

Always turned on. A summary of the day’s activity is sent every day at 20:00 via push
notification.

---

## About

- **Version** — `2026.08.28`
- **Disconnect Actual Budget** — placeholder, not built
