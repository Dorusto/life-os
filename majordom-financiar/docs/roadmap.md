# Majordom — Roadmap

> **Majordom acts. The user approves.**
> Every decision filtered through: Can Majordom deduce this from data? If not — can it ask conversationally?
> New UI page = last resort.

For Actual Budget integration details (split transactions, multi-currency, credit cards, Enable Banking, etc.) → **[docs/specs/ab-integration.md](specs/ab-integration.md)**

---

> **Boundary with `product-plan.md` (set 2026-08-30):** this file is the **record of what was
> built** — milestone themes and their outcomes. `docs/product-plan.md` holds the **forward
> direction** — the product position and the phases we build toward next. When an unbuilt
> milestone here overlaps a phase there (M2.5 ≈ Phase C, M5 ≈ Phase D), the phase is the one that
> decides what gets picked up; this file records the result. Never restate a phase's plan here —
> that is how two documents start disagreeing (see `docs/audit-2026-08.md`, F4/F5).

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
| 2.8 | Home redesign: design tokens + `<Card>`/`<InfoIcon>` | ✅ See [#163](https://github.com/Dorusto/life-os/issues/163) |
| 2.9 | Home redesign: Portfolio Independence card | ✅ See [#164](https://github.com/Dorusto/life-os/issues/164) |
| 2.10 | Home redesign: FIRE model rewrite (2-phase, chat-editable) | ✅ See [#166](https://github.com/Dorusto/life-os/issues/166) |
| 2.11 | Home redesign: Home polish (empty states, sync icon, budget period nav) | ✅ See [#165](https://github.com/Dorusto/life-os/issues/165) |
| 2.12 | Home redesign: Expense Coverage (Coast/Barista FIRE) | 🔲 See [#167](https://github.com/Dorusto/life-os/issues/167) |

### ✅ M3 — Vehicle Management (Fuelio replacement)
| # | Feature | Status |
|---|---------|--------|
| 3.1 | Vehicle profiles + log (SQLite schema) | ✅ |
| 3.2 | Fuelio CSV import → vehicle_log | ✅ |
| 3.3 | Refuel from photo + chat (`log_refuel`), FuelReceiptCard unified | ✅ |
| 3.4 | Consumption + cost calculations | ⏸️ on hold |
| 3.5 | Reminders | ➡️ merged into M4.6 |
| 3.6 | Vehicle log management via chat | ✅ |

Dedicated UI tab (mileage/consumption/cost-per-km/monthly-cost charts + purchase-price/depreciation value tracking with AB sync) shipped as the Vehicles section on the Accounts tab — see [#208](https://github.com/Dorusto/life-os/issues/208). Still open: cross-vehicle comparison, service history, fuel price trend.

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
| 4.9 | FIRE / Crossover Point Report in chat | ✅ |
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

Tool layer decoupled from ActualBudgetClient via Protocol. `FINANCE_BACKEND=sure` switches provider with no tool code changes. Scope: `actual_budget.py`, `category_actions.py`, `notification_service.py`. **API layer routing done 2026-08-30 ([#222](https://github.com/Dorusto/life-os/issues/222)):** all 11 `backend/api/*.py` modules (accounts, transactions, budget, etc.) plus `tools/finance/vehicle.py` now go through `get_provider()` too — see `docs/decisions.md#financeprovider-adapter-finished`. Extracting `finance/` as an independent HTTP service (M6.2, row 6.2 below) is still separate, unstarted work.

---

### 🔲 M5 — Integrations (Portfolio — engine TBD)

Platform: Ghostfolio dropped 2026-08-28 — see `docs/decisions.md#ghostfolio-dropped`. Portfolio
data source is open, not re-decided; `docs/decisions.md#ghostfolio-vs-sure-portfolio-comparison`
is superseded. Items below that assume Ghostfolio specifically are blocked on that open question,
not on infra.

| # | Feature | Status |
|---|---------|--------|
| 5.1 | portfolio-bridge: Bitvavo → (portfolio engine, TBD) | 🔲 See [#4](https://github.com/Dorusto/life-os/issues/4) — blocked on portfolio-source decision, not just infra now |
| 5.2 | FinanceProvider abstraction in Majordom | ✅ |
| 5.3 | ~~Switch Majordom → Sure backend~~ | ⛔ not pursued for now — see `docs/decisions.md#ghostfolio-vs-sure-portfolio-comparison` |
| 5.4 | Crypto tracker with sell alert | 🔲 See [#44](https://github.com/Dorusto/life-os/issues/44) — portfolio-source dependent |
| 5.5 | Trading 212 sync (→ portfolio engine, TBD) | 🔲 |
| 5.6 | XTB sync (→ portfolio engine, TBD) | 🔲 |
| 5.7 | MCP server endpoint for Majordom (inbound, for OpenClaw/external agents — unrelated to Sure/Ghostfolio) | 🔲 See [#58](https://github.com/Dorusto/life-os/issues/58) |
| 5.8 | Child portfolio dashboard | 🔲 See [#45](https://github.com/Dorusto/life-os/issues/45) |
| 5.9 | Freelance / ZZP dashboard | ✅ Done 2026-07-03, see [#126](https://github.com/Dorusto/life-os/issues/126) |
| 5.10 | Joint / couple budget | 🔲 See [#46](https://github.com/Dorusto/life-os/issues/46) |
| 5.11 | Public demo on a VPS | 🔲 See [#168](https://github.com/Dorusto/life-os/issues/168) |

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

Issue-level priority lives natively on GitHub (2026-07-03) — not in a hand-maintained doc. See `.claude/rules/priority-tracking.md` for the full rule and query examples.

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
