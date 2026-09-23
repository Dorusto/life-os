"""
Compatibility round-trip: current actualpy against a (scratch) Actual Budget server (#300).

Exercises the same sync path Majordom depends on — bootstrap/login, create + upload a
budget, write a transaction, commit, then download the budget again in a fresh session
and read the transaction back. Exit 0 = compatible, 1 = broken.

Never point this at a real server: it bootstraps the server password and creates a budget.

Usage:
    AB_URL=http://localhost:5006 AB_PASSWORD=example-scratch python scripts/ab_compat_check.py
"""
import datetime
import json
import os
import sys
import urllib.request
import warnings
from importlib.metadata import version

# actualpy warns about skipped JS migrations when it creates a budget itself — expected here.
warnings.filterwarnings("ignore", category=UserWarning, module="actual")

BUDGET_NAME = "compat-check"
AMOUNT = 12.34


def server_version(url: str) -> str:
    try:
        with urllib.request.urlopen(f"{url}/info", timeout=10) as r:
            return json.load(r).get("build", {}).get("version", "unknown")
    except Exception as e:  # informational only — the round trip decides the verdict
        print(f"warning: could not read server version: {e}")
        return "unknown"


def main() -> int:
    from actual import Actual
    from actual.queries import create_account, create_transaction, get_account, get_transactions

    url = os.getenv("AB_URL", "http://localhost:5006")
    password = os.getenv("AB_PASSWORD", "example-scratch")
    print(f"actualpy {version('actualpy')} vs actual-server {server_version(url)}")

    try:
        with Actual(url, password=password, bootstrap=True) as actual:
            actual.create_budget(BUDGET_NAME)
            actual.upload_budget()
            account = create_account(actual.session, "Compat account")
            create_transaction(
                actual.session, datetime.date.today(), account, "Compat payee",
                notes="compat-check", amount=AMOUNT,
            )
            actual.commit()

        # Second session on the now-existing file: sync a change into it (the path
        # Majordom uses on every write), then read everything back in a third one.
        with Actual(url, password=password, file=BUDGET_NAME) as actual:
            account = get_account(actual.session, "Compat account")
            create_transaction(
                actual.session, datetime.date.today(), account, "Compat payee",
                notes="compat-check", amount=AMOUNT,
            )
            actual.commit()

        with Actual(url, password=password, file=BUDGET_NAME) as actual:
            txs = [t for t in get_transactions(actual.session) if t.notes == "compat-check"]
            if len(txs) != 2 or any(abs(float(t.get_amount()) - AMOUNT) > 0.001 for t in txs):
                print(f"FAIL: expected two {AMOUNT} transactions after re-download, got {len(txs)}")
                return 1
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")
        return 1

    print("PASS: round trip ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
