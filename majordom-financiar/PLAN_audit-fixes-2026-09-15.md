# Implementation plan — fixes from the 2026-09-15 code audit

Source: `docs/audit-2026-09-15.md` (86 findings: 13 HIGH, 33 MEDIUM, 39 LOW — 44 backend, 42 frontend).
Status update 2026-09-15 (evening): **ALL WAVES COMPLETE — 30 fix commits merged to local main**
(Waves 1-5; T8 superseded by issue #296; T32/finding 58 was already fixed by #214, skipped).
Every task: isolated worktree + branch, check scripts / tsc / build, fresh-context review PASS,
orchestrator diff inspection, linear rebase+ff merge. Visual verification done on a local
no-docker stack (uvicorn + vite dev, fixture DB): login, Dashboard, Transactions (incl. bulk-bar
above BottomNav on desktop AND mobile viewport), Accounts, Import, Settings, Chat — all render
clean; deep interaction states (confirm cards mid-chat, error branches needing live AB/LLM)
remain covered by code review only. Local stack left RUNNING (backend :8000 + vite :5173,
login using the local dev fixture account, serves current main).
**Doru must do at deploy:** (1) push 33 commits (origin 3 ahead-pushed + 30 local); (2) set
user_preferences key `fire.excluded_accounts` (JSON list of account-name substrings) on the
real memory.db or FIRE numbers change; (3) add VAPID_CONTACT=mailto:... to .env.
Open follow-ups filed/noted: #296 unified receipt popup, #297 doc drift, #298 timestamp window,
plus noted-in-reports: sw.js nginx no-cache, apple-touch-icon, Duplicates month-key staleness,
setup retry duplicate-account edge, real AB health probe.

## Execution model

- One task = one subagent (GLM Flash latest) = one concern. Tasks are deliberately small and
  fully specified (file:line, exact fix, verification) — no design latitude left to the agent.
- Each task runs on its own branch (`fix/audit-<NN>-<slug>`) from a synced `main`
  (`git fetch origin && git pull --ff-only origin main` before starting; stop and report if
  fast-forward fails).
- Backend verification per task: `python3 backend/check_provider_wiring.py` +
  `python3 backend/check_silent_exceptions.py` PASS, plus the task-specific check below.
- Frontend verification per task: `tsc --noEmit` clean; every UI-visible change additionally
  verified with `python3 /root/scripts/screenshot.py <url> <file.png>` and the screenshot
  actually read/inspected.
- Before "done": `/root/scripts/review-diff.sh <workdir>` must pass (fresh senior reviewer).
  Commit message: subject + 2-5 line body, English only. **Merge to `main` only after Doru
  confirms.** After merging backend/frontend fixes, rebuild the affected local docker service.
- Private-data rule applies to every task: no real names/values into tracked files; the
  pre-commit private-data scanner must pass.
- Parallelism: at most 2-3 tasks at a time, and **never two tasks touching the same file**.
  Sequencing constraints are listed per wave.

## Wave 0 — prep (orchestrator, no subagent)

0.1. Commit the audit doc itself (currently untracked) — needs Doru's OK.
0.2. Repo is 3 commits ahead of `origin/main` — reconcile (push or investigate) before branching.
0.3. Baseline: run both check scripts + `tsc --noEmit`; record results so regressions are attributable.

## Wave 1 — HIGH backend (findings 1–7)

| # | Finding(s) | Task | Verify |
|---|-----------|------|--------|
| T1 | 1 | `api/home.py`: assign `client = get_provider()` in `get_duplicate_pairs()` (1-line fix) | duplicate-review page returns non-empty `available_categories` |
| T2 | 2 | `api/auth.py` + settings: add `jwt_secret` to the settings singleton, read from there; if fallback secret is used, log a loud startup warning (rule 4). Decision taken here: warn, don't hard-fail (single-user, Tailscale-only) | grep: no `os.environ` reads for JWT_SECRET remain |
| T3 | 3 | `core/actual_client/client.py` `get_or_create_payee_id()`: `commit()` before returning so the payee survives the session close | create-transaction flow with a brand-new payee keeps the payee after refresh |
| T4 | 4 | executor leak (client.py:711 + `finance/actual_budget_provider.py`): module-level shared executor or `asyncio.to_thread` | repeated finance calls don't grow thread count (before/after `threading.active_count()`) |
| T5 | 5, 7 | `api/chat.py` + `tools/registry.py`: add `finance__get_savings_rate_chart` to `_PROPOSAL_TOOLS`; remove the dead `finance__propose_clarification` prompt bullet + its dead dispatch entry. Decision taken here: remove, not re-enable (#160/#166 showed the tool doesn't work) | savings-rate chart reaches the frontend as a card and renders |
| T6 | 6 | hoist `temperature`/`max_tokens` from nested `"options"` to payload top level at all LLM call sites: `ocr/vision_engine.py:121`, `csv_importer/detector.py:115`, `api/csv_import.py:180`, `notification_service.py:113` (+ grep for any remaining site) | grep: no OpenAI-compatible call nests these in `options` |

Constraint: T3 and T4 both touch `client.py` → strictly sequential (T3 → T4).

## Wave 2 — HIGH frontend (findings 45–51)

| # | Finding(s) | Task | Verify |
|---|-----------|------|--------|
| T7 | 45 | `CsvImportCard.tsx`: move the 7 `useState` calls above the early returns (hooks order) | tsc; chat mounts card as loading→ready without crash (screenshot) |
| T8 | 46 | dead photo-receipt flow — **needs Doru's decision** (see open questions). Recommended: repoint at the working chat upload path | scanning a receipt from the Add sheet lands on a working flow |
| T9 | 47, 68, 69 | `FuelReceiptCard.tsx`: send category display NAME (not UUID) on confirm; remove the `'dummy'` account_id fallback; stop discarding the error object in the confirm catch | picking any category from the dropdown does not create a bogus AB category |
| T10 | 48 | `App.tsx` + `AbSetupWizard.tsx`: invalidate `['setup-status','ab-connected-gate']` after a successful save | completing the wizard within 60s does not bounce back (screenshot) |
| T11 | 49 | `lib/api.ts` + `pages/Chat.tsx`: buffer the stream per top-level JSON object before parse; add AbortController for unmount | a card JSON artificially split across chunks still renders |
| T12 | 50 | `Transactions.tsx`: bulk bar + notice get `bottom-16 lg:bottom-0` (Dashboard's existing pattern) | mobile screenshot: bulk action visible and tappable above BottomNav |
| T13 | 51, 57 | `lib/auth.ts`: base64url-safe JWT payload decode (replace raw `atob`); only clear the AB-down flag from AB-touching responses | a token whose payload contains `-`/`_` no longer forces logout |

Constraint: T11 and later task T24 both touch `Chat.tsx` → sequential.

## Wave 3 — MEDIUM backend (findings 8–27), grouped by file

| # | Finding(s) | Task | Verify |
|---|-----------|------|--------|
| T14 | 8 | 9 confirm endpoints: delete the pending proposal only on success/cancel, never in `finally` — pattern from `vehicle_proposals.py:148`. One mechanical task across: category_actions, close_account, balance_adjustments, proposals, notification_actions, transfer_conversion, vehicle_log_actions, vehicle_reminder_actions, vehicle_status_actions | simulated transient failure on confirm keeps the card; `check_silent_exceptions.py` PASS |
| T15 | 9, 12 | transactions/receipts/csv_import: failed "create new category" aborts with a clear error instead of continuing; `ConfirmResponse.transaction_id` resolves the real primary key (receipt_service.py:347) so `split_transaction` finds it | failed category create aborts visibly; receipt→split flow works |
| T16 | 10, 11, 13 | setup.py surfaces failures and only completes when applied; `budget_copy` confirm loop gets per-item try/except (pattern from `apply_budget_overview`); `budget.py` rejects an unparseable `month` instead of silently guessing | setup with a failing adjustment reports it; one bad category can't take down the whole copy |
| T17 | 15, 16, 17, 26 | `client.py` dedup contract: shared `financial_id()` for `add_transaction` (kill random `imported_id`); `imported_id` on both transfer legs post-create; `merge_duplicate_transaction()` checks `transferred_id` internally; `execute_csv_import()` uses the in-file `_safe_get_or_create_payee` | import the same CSV twice → no duplicate transfers/payee crash |
| T18 | 14, 27 | `client.py`: `get_home_data()` unreconciled count via shared `_unreconciled_filter_clauses()`; `get_budget_pacing_totals()` hoists one budget history instead of ~9 recomputes | Home bell count never exceeds Inbox list; pacing timing measured before/after |
| T19 | 20, 21, 24 | tool hygiene: `ab_cats` initialized before its try (vehicle.py:82); stale "executes immediately" descriptions fixed (registry.py:451/772/231); vehicle proposal tools return `{"type":"error"}` on not-found instead of plain text | AB-down refuel proposal falls back to empty instead of NameError; LLM sees structured errors |
| T20 | 23 | `_build_system_prompt()`: add the 7 missing tool-guide bullets; stop negative-only mentions of `get_budget_status`/`rename_category` | missing-amount and budget-copy requests reliably pick the right tool (live chat probe) |
| T21 | 22 (+66 backend half) | cross-stack, one agent: pass account/vehicle lists in TransferConversion/VehicleStatus/BalanceAdjustment payloads; render editable selects on the cards (rule 5) | each card allows correcting the target before confirm (screenshot) |
| T22 | 18, 19, 41 | private data in tracked backend files: genericize tool-schema descriptions (registry.py + tools/finance/vehicle.py), remove hardcoded FIRE account names from `core/finance/fire.py` (destination per Doru's answer), remove personal email from `push_service.py` + chmod 0600 on VAPID PEM | private-data scanner passes; FIRE numbers unchanged after the move |

Constraints: T17 → T18 strictly sequential (same file). T22's fire.py half waits on open question Q2.

## Wave 4 — MEDIUM frontend (findings 52–65)

| # | Finding(s) | Task | Verify |
|---|-----------|------|--------|
| T23 | 52 | `Chart.tsx` `useChartRefetch`: check `res.ok` before touching the body | a failed chart response renders the error state, no crash |
| T24 | 59, 60 | `pages/Chat.tsx` + `App.tsx`: move `saveChatHistory()` out of `setMessages()` updaters; fix the permanent skip of `loadChatHistory()` once a chart/list message exists | no duplicate history entries under StrictMode; push-triggered reload works |
| T25 | 53 | confirm-card error pattern: adopt the inline-error pattern (`SetupBalancesCard.tsx:74`) across the 15+ listed cards — mechanical, split into 2 sequential batches if too large for one agent | a failing confirm keeps the card + user edits, shows inline error, offers retry |
| T26 | 54, 67, 70, 71, 72, 73 | batch: genericize the real location/name placeholders; inline `€…toFixed(2)` → `formatCurrency`; NewGoalSheet per-chunk `JSON.parse` fix; CsvImportCard `setTimeout` → `useEffect`; `groupByMonth` UTC-safe parse; extract the duplicate merchant tokenizer | private-data scanner passes; tsc; no visual regressions on affected cards |
| T27 | 55 | dead frontend code deletion: `ui/Modal.tsx`, `ui/Button.tsx`, `ui/Delta.tsx`, `ui/Feedback.tsx`, `ui/Form.tsx`, `ui/MetricTile.tsx`, `ui/Pill.tsx`, `ui/Segmented.tsx`, root `components/Card.tsx`, `lib/ui.ts seriesColor`, non-streaming `sendChatMessage`, `refetch?: any` — grep-verified zero importers; needs Doru's OK (open question Q4) | tsc clean after deletion; grep zero references |
| T28 | 56 | `CategoryActionCard.tsx`: fix `parseFloat(x) || fallback` so 0 is accepted; cleared FIRE fields no longer send NaN→null | entering 0 in a budget field proposes 0, not the fallback |
| T29 | 61, 62 | 4 review pages: add `isError` branches (pattern from Analytics); `DuplicatesReviewPage` confirm failure surfaced, cancel gets a catch | a failing query shows an error state, not "all clear 🎉" |
| T30 | 63, 83 | `ImportPage.tsx`: `min-h-dvh` → `h-dvh` wrapper (rule 42); preview date via `formatDate` | sticky thead/scroll engage (screenshot); dates formatted |
| T31 | 64, 65 | standard invalidation set from every write path (DuplicatesReview, ReceiptFlow, Transactions `applyBulk`, Settings sync); surface load-more/filter errors in Transactions | after a merge/receipt/bulk action the affected queries refetch |
| T32 | 58 | extract `lib/vehicleValueApi.ts` duplicated plumbing onto the shared `authFetch` helper | tsc; vehicle value page unchanged |

Constraints: T24 after T11 (Chat.tsx). T25 pairs with T14 — do backend half first.

## Wave 5 — LOW (findings 28–44 backend, 66–86 frontend)

Two batch tasks for the mechanical items, one per agent:
- **T33 (backend)**: 28 (raw exception text), 30 (size checks before read + magic-byte sniff), 31 (grocery image cleanup), 32 (dead variable), 34 (response_model), 35 (`FINANCE_BACKEND` → settings), 37 (get_payees N+1), 38 (key file perms / MemoryDB init), 40 (`\\d` regex), 42 (sync sqlite3 off the loop), 43 (EXIF orientation, "RON" hardcode).
- **T34 (frontend)**: 66 (BalanceAdjustment editable field — may fold into T21), 74 (Watchlist error branch), 75 (Accounts "Total €0" on error), 76 (AccountDetail flash), 77 (ReceiptFlow local date), 78 (clear-history feedback), 79/80 (Settings hardcoded status/version), 81 (pacing error state), 82 (dedup Trend/NetWorth queries), 85 (wrong error message).

Parked pending Doru's decisions (see open questions): 29, 33, 36, 39, 44 (backend); 84, 86 (frontend).

## Open questions for Doru (block only their own tasks)

1. **Q1 — finding 46 (T8):** photo-receipt flow: restore the old sessionStorage handoff, or repoint the Add sheet's Photo button at the chat upload path (recommended — the handoff's setter page no longer exists)?
2. **Q2 — finding 18 (T22):** move FIRE account exclusions from `core/finance/fire.py` into `user_preferences` (recommended; makes renames safe) — confirm, since it touches how FIRE numbers compute.
3. **Q3 — findings 29, 33, 39:** security posture items (internal vehicle routes without shared secret, authenticated SSRF surface, unauthenticated `/uploads`) — fix now or accept Tailscale-only exposure for now? Recommendation: fix 29+39 cheaply, defer 33.
4. **Q4 — findings 36, 55, 84, 86:** confirm deletion of the listed dead code (backend helpers, 10+ dead frontend files, permanent "coming soon" CashFlow widget, old chat-embedded props).
5. **Q5 — Wave 0:** commit `docs/audit-2026-09-15.md` to the repo, and push the 3 unpushed commits on `main`?

## Order summary

Wave 0 → Wave 1 (T1–T6) → Wave 2 (T7–T13) → Wave 3 (T14–T22) → Wave 4 (T23–T32) → Wave 5 (T33–T34).
Within waves, only the per-wave constraints above force sequencing; everything else can overlap 2-3 at a time. HIGHs are 1-line-to-1-file fixes — quick wins first, and they de-risk the rest.
