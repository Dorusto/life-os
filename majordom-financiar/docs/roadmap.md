# Majordom — Roadmap

> **Majordom acts. The user approves.**
> Every decision filtered through: Can Majordom deduce this from data? If not — can it ask conversationally?
> New UI page = last resort.

For Actual Budget integration details (split transactions, multi-currency, credit cards, Enable Banking, etc.) → **[docs/specs/ab-integration.md](specs/ab-integration.md)**

---

## Milestones

### ✅ M0 — Foundation
| Feature | Status |
|---------|--------|
| Architecture audit — remove `transactions` + `budget_limits` from SQLite | ✅ |
| Account selection on web PWA (receipt, chat, CSV import) | ✅ |
| Budget status dashboard — spending vs budget per category, home page | ✅ |

### ✅ M1 — Daily Driver
| # | Feature | Status |
|---|---------|--------|
| 1.1 | Budget conversational rebalancing (`propose_budget_rebalance` + BudgetRebalanceCard) | ✅ |
| 1.2 | Interactive proposal cards in chat (ProposalCard, AccountTransferCard, ClarificationCard) | ✅ |
| 1.3 | OFX/QFX import support | ⏸️ on hold — no files to test |
| 1.4 | Duplicate merge instead of silent delete on CSV import | ✅ |
| 1.5 | Dashboard correct numbers + CSV categories from AB + tombstone remap | ✅ |

→ [Session log W21](sessions/2026-W21.md)

### ✅ Pre-M2 — Chat Architecture
| Feature | Status |
|---------|--------|
| `tool_choice=auto` — LLM decides which tool to call, no intent routing | ✅ |
| Model: qwen3:14b → deepseek-chat via OpenRouter | ✅ |
| 5 query tools: `get_accounts`, `get_monthly_stats`, `get_budget_status`, `get_transactions`, `get_spending_history` | ✅ |

→ [Session log W21](sessions/2026-W21.md)

### ~~M2 — Onboarding Wizard~~ ❌ CANCELLED
15-question wizard replaced by M2-NEW. All onboarding code removed. `ClarificationCard` + `SetupBalancesCard` kept (generic chat mechanisms).

→ [Session log W21](sessions/2026-W21.md)

### ✅ M2-NEW — Proactive Majordom
| # | Feature | Status |
|---|---------|--------|
| 2.0 | First launch: SetupBalancesCard + `propose_balance_adjustment` | ✅ |
| 2.1 | Daily digest: APScheduler + Web Push at configurable time | ✅ |
| 2.2 | CSV import inline in chat via `+` button | ✅ |
| 2.3 | Pending review nudge (48h after unconfirmed import) | ✅ |
| 2.4 | Import nudge (7 days without import) | ✅ |
| 2.8 | Post-import reconciliation check (ReconciliationCard) | ✅ |

→ [Session log W22](sessions/2026-W22.md)

### 🔄 M2.5 — Insights & Analytics
| # | Feature | Status |
|---|---------|--------|
| 2.5 | Budget calibration (reframed from "goal proposal" — see `docs/decisions.md#budget-calibration`): compare real spending vs. budget, propose corrections + sinking funds | 🔲 See [#110](https://github.com/Dorusto/life-os/issues/110), [#111](https://github.com/Dorusto/life-os/issues/111) |
| 2.6 | FIRE widget on Home screen (off-budget accounts vs target) | ✅ |
| 2.7 | Charts inline in chat | ✅ |

Home screen pending (after M2.5): FIRE % as 3rd metric card, Obligations section (needs decision first — see [docs/decisions.md](decisions.md)).

### ✅ M3 — Vehicle Management (Fuelio replacement)
| # | Feature | Status |
|---|---------|--------|
| 3.1 | Vehicle profiles + log (SQLite schema) | ✅ |
| 3.2 | Fuelio CSV import → vehicle_log | ✅ |
| 3.3 | Refuel from photo + chat (`log_refuel`), FuelReceiptCard unified | ✅ |
| 3.4 | Consumption + cost calculations | ⏸️ on hold |
| 3.5 | Reminders | ➡️ merged into M4.6 |
| 3.6 | Vehicle log management via chat | ✅ |

Backlog (needs dedicated UI tab): mileage log view, moving average consumption, monthly cost charts, cross-vehicle comparison, service history, fuel price trend.

→ [Session log W22](sessions/2026-W22.md)

### 🔄 M4 — Smart Alerts
| # | Feature | Status |
|---|---------|--------|
| 4.1 | Extensible notification system (APScheduler + Web Push + anti-spam) | ✅ |
| 4.2 | Budget alert (after each transaction) | ✅ |
| 4.3 | Income variance alert | ✅ |
| 4.4 | Goal risk alert (weekly) | ✅ |
| 4.5 | Recurring expense audit (monthly) — push on 1st of month: "You have 8 recurring charges: Netflix €15, Ziggo €45… Want to review?" | 🔲 See [#41](https://github.com/Dorusto/life-os/issues/41) |
| 4.6 | Vehicle reminders bundled in daily digest | ✅ |
| 4.7 | Market correction alert (ETF dip) | 🔲 See [#42](https://github.com/Dorusto/life-os/issues/42) |
| 4.8 | Savings goals progress bars | ✅ |
| 4.9 | FIRE / Crossover Point Report in chat | 🔲 See [#156](https://github.com/Dorusto/life-os/issues/156) |
| 4.10 | Persistent chat history + clear button | ✅ |
| 4.11 | Daily digest saved to chat history | ✅ |
| 4.12 | Set category budget amount via chat (`propose_set_category_budget`) | ✅ |

→ [Session log W22](sessions/2026-W22.md) · [W23](sessions/2026-W23.md) · [W24](sessions/2026-W24.md)

### ✅ M4.5 — Smart Categorization

Proactive uncategorized transaction review: digest nudge → pattern-based grouping → category proposal → AB rule creation. User confirms every action via cards.

| # | Feature | Status |
|---|---------|--------|
| 4.5.1 | Digest nudge — mention uncategorized count + prompt hint in evening digest | ✅ |
| 4.5.2 | Review flow — group uncategorized by payee prefix, suggest category per group via chat | ✅ |
| 4.5.3 | AB rule creation at confirm — create payee rule in AB so future transactions are auto-categorized | ✅ |

Replaces backlog items: *"Rules sync with AB"* and *"Bulk recategorization via chat"*.

---

### ✅ M5.0 — Tool domain routing (prerequisite for M5.7 MCP server)

| # | Feature | Status |
|---|---------|--------|
| 5.0.1 | Rename all tools with domain prefix (`finance__*`, `vehicle__*`, `system__*`) | ✅ |
| 5.0.2 | Restructure system prompt into domain sections | ✅ |
| 5.0.3 | Update frontend tool name references if any | ✅ (none needed — frontend routes on `"type"`, not tool name) |

→ Issue [#98](https://github.com/Dorusto/life-os/issues/98) · See `docs/decisions.md#tool-domain-routing`

---

### ✅ M5.2 — FinanceProvider abstraction

Tool layer decoupled from ActualBudgetClient via Protocol. `FINANCE_BACKEND=sure` switches provider with no tool code changes. Scope: `actual_budget.py`, `category_actions.py`, `notification_service.py`. API layer (transactions, accounts, etc.) deferred to M6 extraction.

---

### 🔲 M5 — Integrations (Sure + Portfolio)

**Platform decision (2026-06-03):** Sure replaces Ghostfolio. Sure will eventually replace AB. See `docs/decisions.md#sure-adoption`.

Sure test checklist (before any integration work):
- [x] Deploy Sure on LXC via Docker — Majordom LXC 10.10.1.40:3001, `sure.dorulian.eu`
- [x] Test Enable Banking NL — ING NL syncing live transactions
- [x] Test budget allocation — verify parity with AB categories — tested live 2026-07-05 against a separate Sure test instance (10.10.1.41:3000), partial parity only, see `docs/decisions.md#sure-budget-parity-evaluation`
- [x] Evaluate MCP server (`github.com/we-promise/sure-mcp-server`) — evaluated 2026-07-05, no integration value, see `docs/decisions.md#sure-mcp-evaluation`

| # | Feature | Status |
|---|---------|--------|
| 5.1 | portfolio-bridge: Bitvavo → Sure | 🔲 |
| 5.2 | FinanceProvider abstraction in Majordom | ✅ |
| 5.3 | Switch Majordom → Sure backend | 🔲 |
| 5.4 | Crypto tracker with sell alert | 🔲 |
| 5.5 | Trading 212 sync | 🔲 |
| 5.6 | XTB sync | 🔲 |
| 5.7 | MCP server endpoint for Majordom | 🔲 See [#58](https://github.com/Dorusto/life-os/issues/58) |
| 5.8 | Child portfolio dashboard | 🔲 |
| 5.9 | Freelance / ZZP dashboard | 🔲 See [#126](https://github.com/Dorusto/life-os/issues/126) |
| 5.10 | Joint / couple budget | 🔲 |

~~Ghostfolio~~ — on hold, replaced by Sure. Removed from active roadmap.

---

### 🔲 M6 — life-os modular monorepo (future vision)

Extract each service from Majordom into an independent HTTP service with its own database. Majordom becomes a pure orchestrator calling HTTP endpoints.

| # | Service | Status | Trigger |
|---|---------|--------|---------|
| 6.1 | `vehicle-manager/` — FastAPI + own DB, extracted from memory.db | ✅ Done 2026-07-03, see [#138](https://github.com/Dorusto/life-os/issues/138) | — |
| 6.2 | `finance/` — FinanceProvider as HTTP service | 🔲 | After M5 evaluation |
| 6.3 | `receipt-scanner/` — OCR extracted | 🔲 | When adding async receipt queue |
| 6.4 | `csv-importer/` — import logic extracted | 🔲 | When adding multi-bank profiles |

**Principle:** Extract incrementally when working on a service anyway — not as a standalone refactor. See `decisions.md#vehicle-manager`.

---

## Backlog

Issue-level priority lives natively on GitHub (2026-07-03) — not in a hand-maintained doc. See `CLAUDE.md#priority-tracking` for the full rule and query examples.

Quick reference:
- `gh issue list --label tier-2` / `tier-3` — ready to pick up, ordered by effort
- `gh issue list --label intelligence-cluster` — proactive budget intelligence, medium priority, after standard functionality
- `gh issue list --label deferred-local-first` — blocked on switching back to local LLM
- `gh issue list --label deferred-opportunistic` — not scheduled
- `gh issue list --milestone "M4 — Smart Alerts"` (or M5, M6, ...) — everything in a given phase

Milestones above are descriptive — what phase/theme we're in, what "done" looks like. They don't decide priority; the labels above do, regardless of whether an issue also happens to have a milestone. When a milestone item maps to a tracked issue, the milestone row links to it instead of tracking status twice — see 4.5/4.7/5.7/5.9/6.1 above.

---

## Recommended Hardware

**Target: mini PC with AMD APU** (Ryzen 7 8845HS or similar)

| Spec | Minimum | Recommended |
|------|---------|-------------|
| RAM | 16 GB | 32 GB |
| CPU | Any modern x86 (4+ cores) | AMD Ryzen 7 8845HS |
| iGPU | None (CPU inference) | AMD Radeon 780M (Vulkan → 3–5× faster Ollama) |
| Storage | 64 GB NVMe | 128 GB NVMe |

Brands: Minisforum (UM890 Pro), Beelink (SEi series), GMKtec.
