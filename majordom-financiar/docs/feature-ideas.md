# Majordom — Feature Ideas

Raw ideas not yet turned into GitHub issues. Once something here is actually going to be worked on, open an issue and remove it from this list — this file is a scratchpad, not a priority tracker (that's GitHub Milestones + Labels, see `CLAUDE.md#priority-tracking`).

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
| Security: AI not exposing UUIDs | UUID resolution server-side only; model should never echo AB UUIDs |
| CSV multi-currency columns | Revolut/N26 two-column amounts (original + EUR converted) |
| [RON / multi-currency](specs/ab-integration.md#multi-currency-support-ron-workaround) | Via Rule Action Templating |
| [Returns / reimbursements](specs/ab-integration.md#returns-and-reimbursements) | Returns go back to spending category, not income |
| [Credit card strategies](specs/ab-integration.md#credit-card-accounts) | Paying in full vs. carrying debt |
| [OFX/QFX import](specs/ab-integration.md#ofxqfx-import) | Better deduplication than CSV |
| [Historical transfer migration](specs/ab-integration.md#migrate-historical-transfers) | Link unlinked transfer pairs after bulk import |
| [End of Month Cleanup](specs/ab-integration.md#end-of-month-cleanup) | Auto surplus redistribution via `#cleanup` notes |
| [Transaction tags](specs/ab-integration.md#transaction-tags) | `#deductible`, `#vacation-2025`, etc. |
| [ActualQL for chat](specs/ab-integration.md#actualql-for-chat-ai-queries) | Arbitrary financial queries beyond the 5 pre-built tools — foundation for M2.5 Insights |
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
| Swagger `/docs` link for vehicle-manager | Instead of (or in addition to) sqlite-web, expose vehicle-manager's port and link its auto-generated FastAPI `/docs` UI from Home's menu — structured API browsing vs. raw SQL rows. Revisit once the service matures past the raw-data-fixing stage sqlite-web is useful for now. |

*Last updated: 2026-07-03*
