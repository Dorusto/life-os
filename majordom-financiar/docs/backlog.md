# Majordom — Backlog

Issue-level priority tracking — tactical, changes often as issues get triaged, picked up, or reprioritized. For big-picture milestones (the pillars this all eventually rolls up into) see [docs/roadmap.md](roadmap.md).

---

## Next session — start here (as of 2026-07-03)

Session pattern that's worked well and is worth repeating: pick one issue → discuss trade-offs if it has real variants → implement → verify live against the local docker-compose test stack → commit → session log entry → next.

Ordered by priority/importance, not just size. Time estimates are implementation + verification only — "needs scoping" items can take longer once a trade-off discussion clarifies real scope.

**Tier 0 — risk + foundational debt, do first:** ✅ done — #98 (tool domain routing) completed 2026-07-03.

Tier 1 (#96, #69) dropped from this list — both deprioritized, tracked in their own GitHub issues, revisit when we get to low-priority items.

### Tier 2 — real user-facing value, moderate effort

| Issue | What | Est. |
|---|---|---|
| [#99](https://github.com/Dorusto/life-os/issues/99) | Remove `merchant_mappings` SQLite table, use AB rule history instead | 1-2h |
| [#126](https://github.com/Dorusto/life-os/issues/126) | Freelance/ZZP income dashboard via AB tags — concrete real need (YouTube + Printful). `get_transactions_by_tag()` reuses the existing `#tag` convention. | 1.5-2.5h |
| [#77](https://github.com/Dorusto/life-os/issues/77) | Trend indicator on Cashflow/Net Worth cards | 45min-1h |
| [#78](https://github.com/Dorusto/life-os/issues/78) | `setup_default_groups` UX improvements | 45min-1h |
| [#76](https://github.com/Dorusto/life-os/issues/76) | Offer to add monthly amount to budget after setting a goal | 30-45 min |
| [#82](https://github.com/Dorusto/life-os/issues/82) | Teach user sqlite-web navigation | 15-20 min (conversation, no code) |

### Tier 3 — larger features, need a trade-off discussion first

| Issue | What | Est. |
|---|---|---|
| [#93](https://github.com/Dorusto/life-os/issues/93) | Architecture code audit — do first, natural prep for #138 | half a day+ |
| [#138](https://github.com/Dorusto/life-os/issues/138) | Extract `vehicle-manager` as independent service (FastAPI + own DB, REST + MCP-friendly) — internal modularity only, no public product yet. Unblocks #79, #134. See `decisions.md#vehicle-manager`. | half a day+ |
| [#58](https://github.com/Dorusto/life-os/issues/58) | MCP server endpoint for Majordom's own tools (M5.7) — wanted, sequenced after #138 since it establishes the reusable REST+MCP pattern first | half a day+ |
| [#88](https://github.com/Dorusto/life-os/issues/88) | M6 — setup simplification + platform vision | dedicated planning session, scope not yet clear |

### Proactive budget intelligence — medium priority, grouped (2026-07-03)

Real and eventually important, but standard functionality (Tier 2/3 above) comes first — these don't block anything the app already needs to do. Kept as one cluster rather than spread across tiers since they overlap conceptually (all "notice something the user would otherwise miss"); pick one from the group when standard-functionality work runs out, don't spread across sessions piecemeal. Shared context: financial control with minimal effort — realistic per-category budgets, annual pacing, structured sinking funds, so the user never has to audit AB manually. See `docs/architecture.md#critical-technical-rules` (rule 12) for the goal-template syntax gotcha.

| Issue | What | Est. |
|---|---|---|
| [#110](https://github.com/Dorusto/life-os/issues/110) | Budget realism check per category — detect a one-off purchase inflating a category's average vs. its real recurring spend | 2-3h |
| [#111](https://github.com/Dorusto/life-os/issues/111) | Proactive sinking fund detection — suggest "For a Rainy Day" categories for large predictable expenses before they surprise the user | 2-3h |
| [#112](https://github.com/Dorusto/life-os/issues/112) | Annual budget pacing — cumulative spend vs. 1/12 of annual discretionary pool; must exclude the Starting Balances artifact | 1.5-2.5h |
| [#113](https://github.com/Dorusto/life-os/issues/113) | End-to-end goal budgeting — compound tool: create categories + distribute amount + goal template + rollover, one confirmation card | 3-4h |
| [#114](https://github.com/Dorusto/life-os/issues/114) | Cross-check budget estimates against a vault plan file — read line-item trip/project plans from the vault, propose the category split from them | 2-3h |
| [#124](https://github.com/Dorusto/life-os/issues/124) | Budget config via chat — remaining scope (Automations, goal templates; rollover toggle already done) | 2-4h |
| [#116](https://github.com/Dorusto/life-os/issues/116) | Month-end uncategorized+unreconciled report — Home already surfaces pending items, this is a lower-urgency proactive add-on, not a gap | 1-2h |
| [#41](https://github.com/Dorusto/life-os/issues/41) | Recurring expense audit (monthly) | 1.5-2h |
| [#42](https://github.com/Dorusto/life-os/issues/42) | Market correction alert | 1-1.5h |

### Deferred to local-first LLM switch-back (2026-07-03, see `decisions.md#llm-provider`)

High priority again once local models are back in active use.

- [#75](https://github.com/Dorusto/life-os/issues/75) — chat latency, reframe around `qwen3.5:9b` (preferred over `qwen3:14b` — better quality, slower)
- [#65](https://github.com/Dorusto/life-os/issues/65) — LLM hallucinating account creation
- [#86](https://github.com/Dorusto/life-os/issues/86)/[#80](https://github.com/Dorusto/life-os/issues/80)/[#81](https://github.com/Dorusto/life-os/issues/81) — vision/OCR quality + Ollama VRAM management on local models

### Deferred / opportunistic, not scheduled

- [#115](https://github.com/Dorusto/life-os/issues/115) — split transaction across categories: not a priority right now
- [#117](https://github.com/Dorusto/life-os/issues/117) — assisted reconciliation: low priority
- [#120](https://github.com/Dorusto/life-os/issues/120) — own-account transfer linking: AB already does this when set up manually; the open question is *how* to trigger it from Majordom, not whether it's wanted — needs more thought before it's scoped, not just low priority
- [#79](https://github.com/Dorusto/life-os/issues/79)/[#134](https://github.com/Dorusto/life-os/issues/134) — vehicle list/deactivate + fuel charts: sequenced after [#138](https://github.com/Dorusto/life-os/issues/138) (vehicle-manager extraction), not standalone

---

## Feature ideas (not yet issues)

| Feature | Notes |
|---------|-------|
| [Enable Banking (auto bank sync)](specs/ab-integration.md#enable-banking-automatic-bank-sync) | PSD2 via Enable Banking API — free for personal use; replaces CSV for supported banks |
| Async receipt queue | Upload multiple receipts → queue → review later. Essential for CPU-only setups. |
| Voice input | Whisper local via Ollama → text |
| Editable amount on proposal cards | BudgetRebalanceCard + AccountTransferCard |
| Budget rebalancing by % / income | "Move 10% of income to Restaurants" |
| Document Management System | Nextcloud for storage; Majordom for AI type detection + field extraction; foundation for Majordom Digital |
| Unified + menu in chat | Replace receipt/CSV tabs with `+` menu: camera / gallery / CSV |
| Async upload (non-blocking) | File uploads immediately → user continues chatting while OCR runs |
| MCP server endpoint | Expose `registry.py` tools via MCP standard — issue #58 |
| Security: AI not exposing UUIDs | UUID resolution server-side only; model should never echo AB UUIDs |
| CSV multi-currency columns | Revolut/N26 two-column amounts (original + EUR converted) |
| [RON / multi-currency](specs/ab-integration.md#multi-currency-support-ron-workaround) | Via Rule Action Templating |
| [Split transactions](specs/ab-integration.md#split-transactions) | One receipt across multiple categories — [issue #115](https://github.com/Dorusto/life-os/issues/115) |
| [Returns / reimbursements](specs/ab-integration.md#returns-and-reimbursements) | Returns go back to spending category, not income |
| [Credit card strategies](specs/ab-integration.md#credit-card-accounts) | Paying in full vs. carrying debt |
| [OFX/QFX import](specs/ab-integration.md#ofxqfx-import) | Better deduplication than CSV |
| [Historical transfer migration](specs/ab-integration.md#migrate-historical-transfers) | Link unlinked transfer pairs after bulk import |
| [End of Month Cleanup](specs/ab-integration.md#end-of-month-cleanup) | Auto surplus redistribution via `#cleanup` notes |
| [Transaction tags](specs/ab-integration.md#transaction-tags) | `#deductible`, `#vacation-2025`, etc. |
| [ActualQL for chat](specs/ab-integration.md#actualql-for-chat-ai-queries) | Arbitrary financial queries beyond the 5 pre-built tools — foundation for M2.5 Insights |
| [Reconciliation prompt after import](specs/ab-integration.md#reconciliation-after-csv-import) | Single message after each import: "Want to reconcile the account?" — see [assisted reconciliation #117](https://github.com/Dorusto/life-os/issues/117) |
| [Hold budget for next month](specs/ab-integration.md#hold-budget-for-next-month) | Reserve current "To Budget" for next month — "live on last month's income" strategy |
| Automatic monthly report | Summary push on 1st of month |
| GPU inference for Ollama | Revisit with smaller quantized models or AMD iGPU |
| Caddy + custom domain HTTPS | Alternative to Tailscale for users with their own domain |
| Emergency fund runway | "Your savings cover 4.2 months of expenses." Calculated from savings balance + avg monthly spend. |
| Financial health score | 0–100 on Home: savings rate, emergency fund coverage, budget adherence, net worth trend. |
| Spending anomaly alert | Proactive push: "3× more on Restaurants vs last month." Plugs into M4 notification system. |
| "What if" scenarios in chat | "If I save €200/month more, when do I reach my goal?" Simple math, no new infra. |
| Annual summary | Jan 1st digest: "Last year: €X spent, €Y saved, net worth +Z%. Top category: Transport." |
| Calendar integration | Export APK/insurance/loan deadlines to Nextcloud Calendar as iCal. Data already in AB + vehicle_log. |
| Split bill in chat | "Dinner with 4 people, €120, I paid — how much does each owe?" + log the expense. |
| Net worth trend | Monthly chart 12 months — evolution not just today's snapshot. M2.7 charts infra ready. |

*Last updated: 2026-07-03*
