# Manual-entry vs. Bank-sync Duplicate Review — spec

> Tracked as #181. See `docs/decisions.md` (session 2026-08-27) for how this was scoped apart from #117/#120.

## Problem

A transaction entered manually (e.g. via receipt scan, #121's flow) can get duplicated when the bank sync later imports the same real-world purchase as a separate transaction. #121's `find_near_duplicate_transaction()` only catches the reverse order (bank syncs first, receipt scanned after). Nothing checks newly-synced transactions against existing manual ones.

Confirmed live on production 2026-08-27: 3 duplicate pairs found (`scripts/ab_audit.py dupes`), all same account + exact same amount, one side manual/uncleared, one side bank-synced/cleared, no transfer involved.

## Matching rule (both features below use the same one)

Same account, exact amount match (not tolerance — both sides describe the same real payment, unlike OCR-vs-card-auth amounts in #121), one side `cleared == False` (manual placeholder), one side `cleared == True` (bank-synced). No date-window limit — a bank-linked account's uncleared pool stays small on its own (most transactions clear via sync automatically), so widening the window costs nothing: a bad match is just a dismissible suggestion, never an automatic action.

Scope only accounts with `account_sync_source` set (live bank link) — the same filter `run_bank_resync_all()` already applies. This naturally excludes the envelope/tracking sub-accounts (no bank sync) that produced dozens of false-positive "unmatched pending" hits in the ad-hoc script — those are legitimate un-cleared internal transfers, not duplicates, and are explicitly out of scope here.

## Part 1 — Live check at sync time

`run_bank_resync_all()` already calls `actual.run_bank_sync(account=acc)` per account and gets back the list of newly-imported transactions (currently only `len()` is kept). Run the matching rule for that account, restricted to pairs where the bank-synced side is one of this sync's new transactions. Collect all matches across all accounts and return them alongside the existing `synced_accounts`/`new_transactions`/`failed` keys.

## Part 2 — Historical batch scan, grouped by month

A read-only scan across all bank-linked accounts' full history, same matching rule (not restricted to "just synced"), grouped by the bank-synced side's month (`YYYY-MM`). Used by the review screen below to catch duplicates that predate Part 1 (like the 3 already found).

## Part 3 — Review screen

Opened from a new icon in Home's header (next to the existing sync icon), not a new bottom-nav tab — same precedent as `/import` and `/receipt`. Shows a month list with candidate counts (0-count months excluded or greyed, doesn't matter which); tapping a month shows that month's pairs.

Each pair shows both transactions side by side — date, amount, payee, category, notes — so the user can visually compare before deciding, plus an explicit warning: confirming deletes the manual entry (after copying its category/notes onto the bank-synced one — see Part 4) and cannot be undone from this screen (still possible manually in AB itself, same as any AB edit).

## Part 4 — Merge action

**Not a blind delete.** The manual entry may carry a category or notes the user already set; the bank-synced transaction is typically uncategorized fresh off the bank. Before deleting the manual side: copy its `category_id` and `notes` onto the bank-synced transaction (only if the bank-synced side doesn't already have them — don't overwrite). Then soft-delete the manual transaction via the existing `delete_transaction(financial_id)` (`client.py:861`) — do not write a new delete method.

Confirm/Cancel only, per-pair, no bulk action ever — same `_PROPOSAL_TOOLS` principle as the rest of the app.

## Known limitation, deliberately not solved here

Cancelling a pair doesn't persist a "dismissed" state anywhere — the matching rule is deterministic, so a dismissed pair can resurface on the next scan/sync until one side is actually changed. Acceptable for v1 given how few pairs this produces in practice; revisit only if it turns out to be a recurring annoyance.

## Entry point notification

Skip threading anything through the sync response — simpler and always-accurate: the new header icon (Part 3) shows a badge with the total candidate count, fetched the same way `pendingItems` already is on Home (React Query, `queryKey: ['duplicates', 'months']`, calling the Part 2 months-list endpoint). The badge is just `sum(count for all months)`; no separate "did the last sync find something" state to track. Same `IconButton` badge visual pattern as the existing `pendingItems`/sync-failed badges (`Home.tsx` ~line 116-134) — reuse it, don't invent a new indicator style.
