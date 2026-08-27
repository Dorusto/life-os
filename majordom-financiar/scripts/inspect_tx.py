#!/usr/bin/env python3
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from actual import Actual
from actual.queries import get_transactions, get_accounts

env = dict(os.environ)

def connect():
    token = env.get("ACTUAL_BUDGET_TOKEN")
    if token:
        return Actual(base_url=env["ACTUAL_BUDGET_URL"], token=token, file=env["ACTUAL_BUDGET_SYNC_ID"])
    pw = env["ACTUAL_BUDGET_PASSWORD"]
    return Actual(base_url=env["ACTUAL_BUDGET_URL"], password=pw, file=env["ACTUAL_BUDGET_SYNC_ID"])

ids = sys.argv[1:]

with connect() as actual:
    accounts_by_id = {a.id: a.name for a in get_accounts(actual.session)}
    all_txs = get_transactions(actual.session)
    for t in all_txs:
        if t.id in ids:
            acct_name = accounts_by_id.get(t.acct)
            payee_name = t.payee.name if t.payee else None
            transfer_acct = accounts_by_id.get(t.transfer.acct) if t.transfer else None
            print(f"id={t.id}")
            print(f"  account={acct_name!r} date={t.date} amount={float(t.get_amount())}")
            print(f"  cleared={t.cleared} reconciled={t.reconciled}")
            print(f"  payee={payee_name!r}")
            print(f"  notes={t.notes!r}")
            print(f"  imported_payee={t.imported_description!r}")
            print(f"  transfer_to={transfer_acct!r}")
            print()
