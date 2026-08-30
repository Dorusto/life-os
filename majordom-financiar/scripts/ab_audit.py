#!/usr/bin/env python3
"""
Read-only Actual Budget audit — finds accounts where the AB balance and the
cleared-only balance diverge (pending/uncleared transactions hiding in the
total), dumps transaction detail for a given account, flags likely
manual-vs-bank-sync duplicate pairs (anticipated a transfer manually, then
the real bank-synced transaction landed separately without being merged),
and finds transfers whose link was already broken by a bad merge (#229).

Never writes to Actual Budget. Reconciliation itself stays manual/confirmed
by the user in the AB UI (`docs/decisions.md` — Majordom never writes without
explicit confirmation).

Usage (local machine, outside Docker — override the Tailscale IP for your LXC):
    ACTUAL_BUDGET_URL=http://100.117.109.97:5006 ACTUAL_BUDGET_TOKEN=... python3 scripts/ab_audit.py
    ... python3 scripts/ab_audit.py detail "BUNQ Car" "Revolut Doru"
    ... python3 scripts/ab_audit.py dupes
    ... python3 scripts/ab_audit.py broken_transfers

Usage (inside the container, .env already points at the right host):
    docker exec -it majordom-financiar-majordom-1 python scripts/ab_audit.py
"""
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_env():
    env = dict(os.environ)
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


def _connect(env):
    from actual import Actual

    token = env.get("ACTUAL_BUDGET_TOKEN")
    if token:
        return Actual(base_url=env["ACTUAL_BUDGET_URL"], token=token, file=env["ACTUAL_BUDGET_SYNC_ID"])
    pw = env["ACTUAL_BUDGET_PASSWORD"]
    return Actual(
        base_url=env["ACTUAL_BUDGET_URL"],
        password=pw,
        file=env["ACTUAL_BUDGET_SYNC_ID"],
    )


def _parse_date(d):
    return datetime.strptime(str(d), "%Y%m%d")


def sweep(env):
    from actual.queries import get_accounts, get_transactions

    with _connect(env) as actual:
        accounts = [a for a in get_accounts(actual.session) if not a.closed]
        print(f"{'Account':<22} | {'Total (AB)':>12} | {'Cleared only':>12} | {'Pending':>10} | #pending")
        print("-" * 90)
        for a in accounts:
            txs = get_transactions(actual.session, account=a)
            total = round(sum(t.get_amount() for t in txs), 2)
            cleared_total = round(sum(t.get_amount() for t in txs if t.cleared), 2)
            pending = round(total - cleared_total, 2)
            n_pending = sum(1 for t in txs if not t.cleared)
            flag = "  <-- PENDING!" if abs(pending) > 0.005 else ""
            print(f"{a.name:<22} | {total:>12.2f} | {cleared_total:>12.2f} | {pending:>10.2f} | {n_pending}{flag}")


def detail(env, account_names):
    from actual.queries import get_account, get_accounts, get_transactions

    with _connect(env) as actual:
        accounts_by_id = {a.id: a.name for a in get_accounts(actual.session)}
        for acct_name in account_names:
            acct = get_account(actual.session, acct_name)
            txs = sorted(get_transactions(actual.session, account=acct), key=lambda t: t.date, reverse=True)
            print(f"\n=== {acct_name} ({len(txs)} tx) ===")
            for t in txs:
                amt = t.get_amount()
                payee_name = t.payee.name if t.payee else None
                cat_name = t.category.name if t.category else None
                transfer_acct = accounts_by_id.get(t.transfer.acct) if t.transfer else None
                synced = "SYNC" if t.raw_synced_data else "manual"
                print(
                    f"{t.date} | {amt:>10.2f} | cleared={t.cleared} | sb_flag={t.starting_balance_flag} | "
                    f"{synced:6} | payee={payee_name!r:30} | cat={cat_name!r:20} | "
                    f"transfer_to={transfer_acct!r} | imported_desc={t.imported_description!r}"
                )


def broken_transfers(env):
    """Read-only: find transactions with transferred_id set whose counterpart
    is missing or tombstoned — a link broken by a prior bad merge (see #229).

    `Transactions.transfer` is a relationship that only resolves when the
    counterpart row exists and isn't tombstoned (join condition includes
    `tombstone == 0`) — so `transferred_id` set but `transfer is None` is
    exactly the broken-link signal, no manual lookup needed."""
    from actual.queries import get_accounts, get_transactions

    with _connect(env) as actual:
        accounts = [a for a in get_accounts(actual.session) if not a.closed]
        total = 0
        for a in accounts:
            txs = get_transactions(actual.session, account=a)
            broken = [t for t in txs if t.transferred_id and not t.transfer]
            if not broken:
                continue
            print(f"\n=== {a.name} ===")
            for t in broken:
                print(
                    f"  BROKEN TRANSFER LINK: {t.date} | {t.get_amount():>10.2f} | "
                    f"cleared={t.cleared} | dangling transferred_id={t.transferred_id}"
                )
                total += 1
        print(f"\nTotal broken transfer links: {total}")


def dupes(env, window_days=7):
    """Flag uncleared manual transactions that look like an earlier stand-in
    for a later bank-synced cleared transaction: same account, same amount,
    same transfer target, within `window_days`."""
    from actual.queries import get_accounts, get_transactions

    with _connect(env) as actual:
        accounts = [a for a in get_accounts(actual.session) if not a.closed]
        accounts_by_id = {a.id: a.name for a in accounts}
        grand_total_flagged = 0.0
        for a in accounts:
            txs = get_transactions(actual.session, account=a)
            pending = [t for t in txs if not t.cleared]
            cleared = [t for t in txs if t.cleared]
            if not pending:
                continue
            hits = []
            unmatched = []
            for p in pending:
                p_amt = round(p.get_amount(), 2)
                p_transfer = p.transfer.acct if p.transfer else None
                p_date = _parse_date(p.date)
                match = None
                for c in cleared:
                    if round(c.get_amount(), 2) != p_amt:
                        continue
                    c_transfer = c.transfer.acct if c.transfer else None
                    if c_transfer != p_transfer:
                        continue
                    if abs((_parse_date(c.date) - p_date).days) > window_days:
                        continue
                    match = c
                    break
                if match:
                    hits.append((p, match))
                else:
                    unmatched.append(p)
            if hits or unmatched:
                print(f"\n=== {a.name} ===")
            for p, c in hits:
                target = accounts_by_id.get(p.transfer.acct) if p.transfer else "(no transfer)"
                print(f"  LIKELY DUPLICATE: {p.date} pending {p.get_amount():>10.2f} -> {target}  "
                      f"(matches cleared tx on {c.date})")
                grand_total_flagged += float(p.get_amount())
            for p in unmatched:
                target = accounts_by_id.get(p.transfer.acct) if p.transfer else "(no transfer)"
                synced = "SYNC" if p.raw_synced_data else "manual"
                print(f"  unmatched pending: {p.date} {synced:6} {p.get_amount():>10.2f} -> {target}  "
                      f"(needs manual review)")
        print(f"\nTotal amount in flagged likely-duplicates: {round(grand_total_flagged, 2)}")


if __name__ == "__main__":
    env = _load_env()
    if len(sys.argv) > 1 and sys.argv[1] == "detail":
        detail(env, sys.argv[2:])
    elif len(sys.argv) > 1 and sys.argv[1] == "dupes":
        dupes(env)
    elif len(sys.argv) > 1 and sys.argv[1] == "broken_transfers":
        broken_transfers(env)
    else:
        sweep(env)
