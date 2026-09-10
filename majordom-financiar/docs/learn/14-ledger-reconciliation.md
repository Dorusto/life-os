# 14 — The ledger model — balances, reconciliation, and why the bank stops matching

`docs/learn/04-actual-budget.md` covers how Majordom *talks to* Actual Budget (actualpy, sync
IDs, operation order). This file covers the other half: what a balance actually *is*, why it
drifts, and what to do about it. If the number in Actual Budget doesn't match your bank and you
can't tell why — this is the page that explains what's actually happening.

## A balance is not a number Actual Budget stores — it's a sum it computes

There is no "balance" field anywhere in the database. Every time you (or Majordom) ask for an
account's balance, Actual Budget adds up every transaction ever entered for that account and
gives you the total. `get_accounts()` in Majordom's code does exactly this — it doesn't read a
balance, it triggers that sum.

This is why a balance can be *wrong* in a very specific way: not "corrupted," but **built from the
wrong set of transactions**. Add a transaction that shouldn't be there (a duplicate), or one that's
missing, or one with the wrong amount, and the sum changes accordingly. There is no independent
"real" balance sitting somewhere else in Actual Budget to compare against — the sum of the
transactions *is* the balance, by definition. So when it disagrees with your bank, the discrepancy
isn't a glitch to dismiss; it's the sum telling you the two transaction lists don't actually match.

## Cleared vs. uncleared — this is not a "read" flag

Every transaction has a `cleared` flag. It's easy to assume this means "seen it" or "categorized
it" — it doesn't. It means: **this transaction is confirmed to correspond to something that
actually happened at the bank.**

Two very different things set it:

- **Bank sync sets it automatically.** A transaction that arrived via GoCardless/SimpleFIN import
  is `cleared=True` from the moment it lands — the bank already told Majordom it's real.
- **You set it manually, by reconciling.** A transaction you typed in yourself (cash, a manual
  entry, an import from a CSV with no bank link) starts life `cleared=False`. "Reconciling" in the
  Actual Budget UI — ticking a transaction, or using its reconcile-to-a-target-balance flow — is
  the act of you personally vouching that yes, this really happened, matching what your bank
  statement shows.

So `cleared` isn't bookkeeping trivia — it's the ledger's record of *which transactions have
actually been checked against reality* versus which ones are still just claims. An account with a
pile of uncleared transactions is an account nobody has verified yet.

One easy-to-miss detail: when Majordom splits a transaction into several categories for you,
actualpy's underlying `create_split()` defaults every new child row to `cleared=False`, regardless
of whether the original transaction was already cleared. Majordom's split tool has to explicitly
copy `child.cleared = tx.cleared` onto each piece after creating it — without that, splitting an
already-reconciled transaction would silently leave its pieces permanently unreconciled, for no
reason a user could see.

## Why the number drifts from your bank at all

Given the above, drift has exactly two possible causes — the ledger has a transaction the bank
doesn't (yet) agree with, or it's missing one the bank has:

- **Timing.** A card payment shows in your bank app the moment you tap, but the bank-sync
  transaction can lag by a day or more, or a manual entry gets logged before the matching bank
  transaction has synced. For a short window, the two sides are legitimately out of step —
  nothing is wrong, they just haven't caught up with each other yet.
- **A transaction exists that shouldn't** — most often a duplicate (see below), or a manual entry
  that was later superseded by the real bank-synced one and never removed.
- **A transaction is missing** — you spent something and never logged it manually on an account
  with no bank sync, or a transfer only got recorded on one side of the pair.

None of these mean Actual Budget (or Majordom) is broken. The ledger is a record you (and your
bank feed) build by adding rows to it — if the rows don't match reality, the sum won't either.

## Duplicates: a normal side effect, not a defect

The most common source of drift in practice: you (or Majordom, via a receipt scan or manual
`/add`) log a transaction by hand before the bank-synced version of the same payment has arrived.
A day or two later, the real bank-synced transaction lands as a *second*, separate row — same
amount, same rough date, but a different underlying row. Now the account has two transactions for
one real payment, and the balance is inflated (or deflated, for a transfer) by exactly that
amount. This is not Actual Budget failing to detect a duplicate on its own — nothing in the ledger
model prevents two independently-created rows from describing the same real-world event, because
from the database's point of view they're just two ordinary transactions.

This is common enough that Majordom has a dedicated screen for it: **Duplicates review** (opened
from the Home header icon). It scans for pairs that look like the same underlying payment — same
account, same signed amount, one manually-entered/uncleared and one bank-synced/cleared, within a
plausible date window — and lets you merge them one pair at a time. Two shapes exist:

- **Manual vs. bank-synced pair** (`merge_duplicate_transaction()`): keeps the bank-synced side
  (it's the trustworthy one — fresh off the bank), copies over any category/notes/payee the manual
  entry had that the bank-synced side is still missing, then removes the manual entry.
- **Transfer-linked pair** (`resolve_transfer_duplicate()`): if the manual side is actually one leg
  of a transfer (money you already recorded moving between two of your own accounts), it can't
  simply be deleted — that would break the transfer's link to its counterpart in the other account
  and corrupt *both* balances. Instead, the transfer leg is kept, its payee/category are filled in
  from the bank-synced duplicate if missing, its date is corrected to the bank-synced side's date
  (the transfer leg's own date is the less trustworthy one here), and the redundant bank-synced row
  is removed instead.

Nothing here is automatic — every merge is a card you review and confirm, never a silent bulk
cleanup (see the confirmation principle below).

## Starting balances: one wrong number, felt everywhere downstream

When an account is created, Actual Budget records its opening balance as a transaction — a
"Starting Balance" row, exactly like any other transaction, just dated at the account's creation
point. This is necessary (the ledger needs *some* transaction to establish where the running total
begins), but it has a real consequence: **Actual Budget's own native reports (Total Income YTD, the
Net Worth graph) count that opening balance as "income."** Add a new off-budget account with
€8,000 already in it, and AB's income report jumps by €8,000 that month — not because you earned
anything, but because the ledger had to start counting from somewhere.

Concretely, this means:

- If a starting balance was entered wrong (typo, wrong currency conversion, guessed instead of
  looked up), *every* balance and every trend derived from that account is off by the same amount,
  permanently, until the starting balance itself is corrected — not something that "evens out"
  over time.
- Any income/net-worth number Majordom shows you has to explicitly exclude these rows, or it would
  inherit AB's own inflated-income quirk. This is a real rule in the codebase
  (`docs/architecture.md`, rule 13, tracked as issue #112) — Majordom's own stats deliberately
  filter out "Starting Balance"-flagged rows for exactly this reason; AB's *own* built-in reports do
  not.

If a balance has looked wrong since the day an account was added, check that account's very first
transaction before looking anywhere else.

## What to actually do when the balance doesn't match

In order, cheapest check first:

1. **Give it a day.** If the gap appeared very recently and the account has bank sync, it may just
   be sync lag — a pending card payment that hasn't posted yet.
2. **Check the Duplicates review screen** (Home header icon) for this account's month. This is by
   far the most common cause once timing is ruled out.
3. **Look at the account's starting balance** if the drift has been there since the account was
   created rather than appearing recently.
4. **Ask Majordom to investigate the specific account**, rather than jumping straight to "just fix
   the number." Majordom's `get_reconciliation_suspects()` pulls the account's uncleared
   transactions and most recent activity, and — if you tell it the real balance your bank shows —
   flags which of those look like they could explain the exact gap. This exists specifically
   because patching the difference with one silent correction transaction hides *which*
   transaction was wrong instead of finding it (a real case that motivated this: Actual Budget
   showed one balance, the bank app showed a different one, and there was no way to tell from the
   number alone where the difference came from).
5. **Only as a last resort**, accept a balance adjustment: Majordom creates one transaction, tagged
   `[Balance Adjustment]` in its notes, for exactly the remaining difference, dated today. It's
   deliberately excluded from spending totals and from the "needs reconciliation" list (so it
   doesn't itself become a thing you have to clean up later) — but it is a correction, not an
   explanation. It closes the gap in the number without telling you what caused it, which is why
   it's the option to reach for last, not first.

## What Majordom does for you, and what stays yours

Every tool that changes something in Actual Budget — including every merge, every balance
adjustment, every reconciliation action described above — goes through a proposal → editable card
→ your explicit confirmation → execute flow, with no exceptions. Majordom investigates, suggests,
and shows its work; it never reconciles anything on its own initiative, and it never silently
bulk-fixes a whole account.

Reconciliation itself — the moment-to-moment ticking of "yes, this happened" — stays a manual
action you take in the Actual Budget UI (or via one of the confirm cards above). Majordom's
read-only audit tooling (`scripts/ab_audit.py`) is explicit about this in its own header: it never
writes to Actual Budget, precisely because deciding what's real in your own ledger is meant to
stay a decision you make, not one that gets made for you.
