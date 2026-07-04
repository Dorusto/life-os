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
| [W23](2026-W23.md) | 2026-06-03 | Architecture strategy: Sure adoption + MCP server + FinanceProvider abstraction | docs/decisions.md, docs/architecture.md, docs/roadmap.md |
| [W23](2026-W23.md) | 2026-06-03 | Sure install + Enable Banking NL + XTB CSV converter + migrate to Majordom LXC | Obsidian guide, xtb_to_sure.py, docker-compose.yml |
| [W24](2026-W24.md) | 2026-06-12 | propose_set_category_budget tool + domain routing architecture decision | actual_budget.py, CategoryActionCard.tsx, decisions.md, architecture.md |
| [W25](2026-W25.md) | 2026-06-15 | propose_categorize_by_payee — bulk categorization via chat + editable card | actual_budget.py, client.py, CategoryActionCard.tsx, category_actions.py |
| [W25](2026-W25.md) | 2026-06-21 | M4.5.2+3: uncategorized review flow + AB rule creation (is_consistent flag) | client.py, actual_budget.py, registry.py, chat.py, category_actions.py, CategoryActionCard.tsx |
| [W25](2026-W25.md) | 2026-06-21 | M5.2: FinanceProvider Protocol — tool layer decoupled from ActualBudgetClient | core/finance/provider.py, actual_budget_provider.py, actual_budget.py |
| [W25](2026-W25.md) | 2026-06-21 | M4.2+4.3+4.4: budget alert (immediate push), income variance, goal risk | notification_service.py, actual_budget.py, provider.py, main.py |
| [W25](2026-W25.md) | 2026-06-21 | M2.7: spending chart inline in chat — donut SVG card via get_spending_chart tool | actual_budget.py, registry.py, chat.py, Chat.tsx |
| [W25](2026-W25.md) | 2026-06-21 | M2.7b: 3 additional chart types — budget vs actual, spending trend, goals progress | BudgetChart.tsx, TrendChart.tsx, GoalsChart.tsx, actual_budget.py |
| [W27](2026-W27.md) | 2026-07-02 | Vault findings → issues #101-#131 + CSV import cleared/imported_id fix (#101, #102) | api/csv_import.py, docs/architecture.md, docs/roadmap.md |
| [W27](2026-W27.md) | 2026-07-02 | CSV import currency conversion (#103) + account auto-suggestion (#118) + near-duplicate detection | detector.py, csv_import.py, ImportPage.tsx, CsvImportCard.tsx |
| [W27](2026-W27.md) | 2026-07-03 | Categorization bug batch: unify tools (#104), fix inconsistent card (#107), setup Skip option (#108) | registry.py, actual_budget.py, chat.py, category_actions.py, CategoryActionCard.tsx, SetupBalancesCard.tsx |
| [W27](2026-W27.md) | 2026-07-03 | #109 payee fuzzy matching + #132 notes-based categorization filter | actual_budget.py, client.py, CategoryActionCard.tsx |
| [W27](2026-W27.md) | 2026-07-03 | UX polish batch (#119, #127, #128, #129, #130, #131) | actual_budget.py, client.py, chat.py, notification_service.py |
| [W27](2026-W27.md) | 2026-07-03 | #122: notes-based category suggestion + AB rule creation | actual_budget.py, client.py, proposals.py, api/proposals.py |
| [W27](2026-W27.md) | 2026-07-03 | #123: notes-based fallback in uncategorized-groups review | client.py, chat.py |
| [W27](2026-W27.md) | 2026-07-03 | #120 paused, #121 near-duplicate receipt/bank-sync merge implemented | client.py, receipt_service.py, api/receipts.py, ReceiptCard.tsx, FuelReceiptCard.tsx |
| [W27](2026-W27.md) | 2026-07-03 | Old-issue cleanup: #118 missed close, #39/#40 stale, #83 real delete_transaction fix | api/vehicle_log_actions.py, tools/finance/vehicle.py, VehicleLogActionCard.tsx |
| [W27](2026-W27.md) | 2026-07-03 | Full old-issue audit (#4, #7, #8, #9, #11, #32, #33, #56, #57, #59, #62, #100) | database.py, docs/roadmap.md |
| [W27](2026-W27.md) | 2026-07-03 | #87 copy last month's budget + #125 goal-template fix + rollover toggle (#124 partial) | client.py, actual_budget.py, category_actions.py, BudgetCopyCard.tsx |
| [W27](2026-W27.md) | 2026-07-03 | Home dashboard: rollover categories disappearing (real production bug) | actual_client/client.py |
| [W27](2026-W27.md) | 2026-07-03 | Home "Needs resolving" widget redesign + unreconciled/bank-sync logic (#130 follow-up) | notification_service.py, client.py, chat.py, Home.tsx, Chat.tsx |
| [W27](2026-W27.md) | 2026-07-03 | #89: create destination account inline from the transfer card | actual_budget.py, accounts.py, chat.py, AccountTransferCard.tsx, api.ts |
| [W27](2026-W27.md) | 2026-07-03 | Reverted bank-sync/CSV staleness noise from Home pending-items widget | notification_service.py |
| [W27](2026-W27.md) | 2026-07-03 | Vehicle reminders hidden by anti-spam + staleness re-added with a watchlist | notification_service.py |
| [W27](2026-W27.md) | 2026-07-03 | resync ING bug hunt: actualpy balanceType (#135), chat history persistence (#106), PWA stale cache, goal dedup, Fuelio research (#134) | client.py, notification_service.py, Chat.tsx, App.tsx, sw.js, registry.py |
| [W27](2026-W27.md) | 2026-07-03 | #95: daily backup cron activated + backup.sh root-owned-cleanup fix + get_backup_status tool | scripts/backup.sh, tools/ops.py, registry.py, settings.py, docker-compose.yml, DEPLOY.md |
| [W27](2026-W27.md) | 2026-07-03 | Backlog sweep: #92 (PWA scroll, fixed by cache fix) closed, #69/#96 deprioritized, #97 deploy.yml fix verified live | .github/workflows/deploy.yml, docs/decisions.md |
| [W27](2026-W27.md) | 2026-07-03 | #98: tool domain routing — 34 tools prefixed finance__/vehicle__/system__, system prompt restructured | tools/registry.py, api/chat.py, docs/decisions.md, docs/architecture.md |
| [W27](2026-W27.md) | 2026-07-03 | #137: stop persisting empty assistant responses to chat history | pages/Chat.tsx |
| [W27](2026-W27.md) | 2026-07-03 | Backlog triage + #99 audit: fixed pending_review SQLite violation, discovered majordom-api build-vs-restart trap | core/memory/database.py, api/csv_import.py, docs/architecture.md, docs/decisions.md, docs/roadmap.md |
| [W27](2026-W27.md) | 2026-07-03 | Doc cleanup: split docs/backlog.md out of roadmap.md, tracked root CLAUDE.md in git | docs/roadmap.md, docs/backlog.md, docs/INDEX.md, CLAUDE.md (both), .gitignore |
| [W27](2026-W27.md) | 2026-07-03 | Priority tracking moved to GitHub Milestones + Labels, docs/backlog.md retired same day | docs/roadmap.md, docs/feature-ideas.md, CLAUDE.md (both), docs/INDEX.md, docs/learn/13-starting-a-task.md, docs/architecture.md |
| [W27](2026-W27.md) | 2026-07-03 | Full documentation audit: closed stale M2/M3 milestones, fixed broken anchors, deleted 3 orphaned docs, rewrote both stale READMEs | docs/decisions.md, docs/architecture.md, docs/INDEX.md, README.md (both) |
| [W27](2026-W27.md) | 2026-07-03 | #93 code audit: dead endpoints removed, duplicated finance-calc logic unified across get_monthly_stats/get_budget_status/get_home_data | core/actual_client/client.py, api/transactions.py, api/fire.py (deleted), api/home.py, api/vehicle_proposals.py, main.py, lib/api.ts |
| [W27](2026-W27.md) | 2026-07-03 | #138: vehicle-manager extracted as independent FastAPI service, deployed to production same day; 5 real bugs found during audit/live testing (dev + prod data); Tailscale Serve gap fixed; #139 (chat LLM data hallucination) opened | tools/vehicle-manager/ (new), core/vehicle_client/ (new), tools/finance/vehicle.py, api/{fuelio_import,receipts,vehicle_proposals,vehicle_log_actions,vehicle_reminder_actions}.py, services/{notification_service,receipt_service}.py, config/settings.py, memory/database.py, docker-compose.yml, Home.tsx, DEPLOY.md |
| [W27](2026-W27.md) | 2026-07-03 | #139: chat LLM misreporting tool data — 3 root causes fixed (prompt example contamination, missing verbatim-relay rule, elliptical-follow-up argument anchoring); #140 (domain routing) + #141 (logging gap) opened, deferred | api/chat.py, docs/architecture.md, docs/decisions.md |
| [W27](2026-W27.md) | 2026-07-03 | #76: offer budget top-up after setting a savings goal — chained card + new chat-history persistence edge case fixed (rule 17 corollary) | actual_budget.py, category_actions.py, api.ts, GoalProposalCard.tsx, Chat.tsx, docs/architecture.md |
| [W27](2026-W27.md) | 2026-07-03 | #79: vehicle list/deactivate chat tool — found and fixed a real `active`-field gap left by #138's extraction | tools/vehicle-manager/app/{models,database}.py, tools/finance/vehicle.py, vehicle_status_actions.py (new), registry.py, chat.py, api.ts, VehicleStatusCard.tsx, Chat.tsx |
| [W27](2026-W27.md) | 2026-07-03 | #77: trend indicators on Cashflow/FIRE cards — Net Worth card no longer exists (replaced by FIRE M5.2), redirected trend there instead; found + filed #142 (real `/api/home` race with `/api/home/pending`) | client.py, home.py, api.ts, Home.tsx, FireWidget.tsx |
| [W27](2026-W27.md) | 2026-07-03 | Home UI polish (Budget card title/layout) + #142 fixed: process-wide actualpy lock serializes concurrent client instances | BudgetDashboard.tsx, actual_client/client.py |
| [W27](2026-W27.md) | 2026-07-03 | #126: get_transactions_by_tag for freelance/ZZP order costing — hit the FinanceProvider pass-through gotcha (client method invisible to tools until also added to provider + Protocol) | client.py, actual_budget.py, registry.py, actual_budget_provider.py, provider.py, CLAUDE.md |
| [W27](2026-W27.md) | 2026-07-03 | #141: logging.basicConfig() added — all logger.info() calls had been silent no-ops since day one | main.py |
| [W27](2026-W27.md) | 2026-07-04 | #99: merchant_mappings removed, replaced by Actual Budget's native Rules engine; 3 real bugs found in live testing (rule dedup, transfer auto-resolve, closed-account transfer) + 2 follow-on features (create account/category inline); #145 reconciliation card removed | client.py, csv_import.py, receipt_service.py, income_sources.py, proposals.py, CsvImportCard.tsx, ReceiptCard.tsx, IncomeSourceCard.tsx |
| [W27](2026-W27.md) | 2026-07-04 | Post-#99 discussion: Sure/Ghostfolio evaluation scoped, #148 found (csv_import/receipt_service bypass FinanceProvider), #78 prompt prepared | docs/decisions.md, docs/roadmap.md, root CLAUDE.md |
