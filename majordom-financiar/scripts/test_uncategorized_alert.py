#!/usr/bin/env python3
"""
Quick test for M4.5.1 — uncategorized transactions alert.
Runs the checker directly, bypasses the daily digest guard.

Usage (inside container):
    docker exec -it majordom-financiar-majordom-1 python scripts/test_uncategorized_alert.py

Usage (local, with .env loaded):
    cd majordom-financiar
    set -a && source .env && set +a
    python scripts/test_uncategorized_alert.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def main():
    from backend.core.config import settings
    from backend.core.actual_client import ActualBudgetClient
    from backend.core.memory.database import MemoryDB
    from backend.services.notification_service import _check_uncategorized_transactions

    print("=== M4.5.1 — Uncategorized alert test ===\n")

    # Step 1: raw count from AB
    print("1. Querying Actual Budget for uncategorized transactions...")
    client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )
    try:
        count = await client.count_uncategorized()
        print(f"   → Found {count} uncategorized transaction(s) in AB\n")
    except Exception as e:
        print(f"   ✗ AB query failed: {e}\n")
        return

    # Step 2: full checker (includes rule + anti-spam check)
    print("2. Running _check_uncategorized_transactions()...")
    db = MemoryDB(settings.memory.db_path)

    # Seed rule if missing (simulates first startup)
    if not db.get_notification_rule("uncategorized_alert"):
        db.upsert_notification_rule("uncategorized_alert", enabled=True, config={})
        print("   (rule seeded for first time)\n")

    result = await _check_uncategorized_transactions(db)
    if result:
        print(f"   → Digest text: \"{result}\"")
    else:
        print("   → No alert (0 uncategorized, disabled, or already sent today)")

    print("\n=== Done ===")


asyncio.run(main())
