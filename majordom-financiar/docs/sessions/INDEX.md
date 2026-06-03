# Sessions Index

| Week | Date | Topic | Key files |
|------|------|-------|-----------|
| [W21](2026-W21.md) | 2026-05-19 | M1.2: chat tools — propose_transaction, rebalance, transfer | api/chat.py, tools/registry.py |
| [W21](2026-W21.md) | 2026-05-19 | M1.1: budget rebalancing + OCR timeout fix | api/budget.py, nginx.conf |
| [W21](2026-W21.md) | 2026-05-20 | tool_choice=auto, qwen3:14b, 5 query tools | api/chat.py, chat_service.py |
| [W21](2026-W21.md) | 2026-05-21 | Dashboard fix: tombstone categories + CSV categories from AB | core/actual_client/client.py, api/csv_import.py |
| [W21](2026-W21.md) | 2026-05-21 | AccountTransferCard with dropdowns | components/AccountTransferCard.tsx |
| [W21](2026-W21.md) | 2026-05-21 | Onboarding M2 state machine (later cancelled) | api/onboarding.py, onboarding_service.py |
| [W21](2026-W21.md) | 2026-05-22 | Tombstone categories in stats + payee bug investigation | core/actual_client/client.py, api/receipts.py |
| [W22](2026-W22.md) | 2026-05-30 | Transfer detection fail + CSV profile corruption | core/csv_importer/, core/memory/database.py |
| [W22](2026-W22.md) | 2026-05-30 | Ollama corrupts CSV profiles + SmartCategorizer stale data | core/memory/database.py |
| [W22](2026-W22.md) | 2026-05-30 | Setup flow inline + decimal_to_cents bug + balance adjustment | api/setup.py, tools/finance/actual_budget.py |
| [W22](2026-W22.md) | 2026-05-30 | Web Push VAPID keys — file not JSON string | core/memory/push_service.py |
| [W22](2026-W22.md) | 2026-05-30 | M2.1: APScheduler daily digest + Web Push | core/memory/scheduler.py, services/notifications.py |
| [W22](2026-W22.md) | 2026-05-30 | Tailscale HTTPS for Web Push on mobile | Proxmox LXC config |
| [W22](2026-W22.md) | 2026-05-30 | CSV import moved to chat + IncomeSourceCard | frontend/Chat.tsx, api/csv_import.py |
| [W22](2026-W22.md) | 2026-05-31 | ING transfer detection: Code=GT (not IBAN regex) | core/csv_importer/builtin_profiles.py |
| [W22](2026-W22.md) | 2026-05-31 | React gotchas in CsvImportCard (3 bugs) | frontend/components/CsvImportCard.tsx |
| [W22](2026-W22.md) | 2026-05-31 | Receipt inline in chat + SQLite orphan tables cleanup | frontend/Chat.tsx, api/receipts.py |
| [W22](2026-W22.md) | 2026-05-31 | M2.4 import nudge + M2.3 pending review pattern | core/memory/database.py, services/notifications.py |
| [W22](2026-W22.md) | 2026-05-31 | Home redesign: Cashflow + Net Worth + Goals (TARGET: pattern) | api/transactions.py, frontend/Home.tsx |
| [W22](2026-W22.md) | 2026-05-31 | Category groups in BudgetDashboard + expand | core/actual_client/client.py, frontend/BudgetDashboard.tsx |
| [W22](2026-W22.md) | 2026-05-31 | Category management tools + goal deadline + _PROPOSAL_TOOLS | tools/registry.py, api/chat.py, frontend/CategoryActionCard.tsx |
| [W22](2026-W22.md) | 2026-05-31 | Migration to LXC Proxmox: 5 bugs in chain | docker-compose.yml, api/chat.py |
| [W22](2026-W22.md) | 2026-05-31 | M4.6 vehicle reminders + notification bundling | services/notifications.py, tools/finance/vehicle.py |
| [W22](2026-W22.md) | 2026-05-31 | M3.6 vehicle log management via chat | tools/finance/vehicle.py, api/vehicle_log_actions.py |
| [W22](2026-W22.md) | 2026-05-31 | M3.3 FuelReceiptCard unified + log_refuel | api/receipts.py, api/vehicle_proposals.py, frontend/FuelReceiptCard.tsx |
| [W23](2026-W23.md) | 2026-06-01 | Notifications in chat + bug user_id="default" | api/push.py, services/notifications.py, frontend/App.tsx |
| [W23](2026-W23.md) | 2026-06-01 | Migration to OpenAI-compatible API + OpenRouter | services/chat_service.py, api/chat.py |
| [W23](2026-W23.md) | 2026-06-02 | Unified /api/home — 4× download_budget → 1× (~800ms) | api/home.py, actual_client/client.py, frontend/Home.tsx |
| [W23](2026-W23.md) | 2026-06-03 | Issue audit (11 closed) + vehicle type + digest UX + modal fix | database.py, notification_service.py, Chat.tsx, BudgetDashboard.tsx |
