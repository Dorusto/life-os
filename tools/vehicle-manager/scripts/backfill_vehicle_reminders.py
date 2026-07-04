#!/usr/bin/env python3
"""
One-off backfill: apply derive_vehicle_reminder_fields() to vehicles imported
before the Fuelio import started patching the vehicle profile (apk_due,
insurance_due, service_interval_km/months, last_service_km/date) — see
fuelio_parser.derive_vehicle_reminder_fields. Safe to re-run; it only
overwrites a field when the vehicle_log actually has a value for it.

Usage:
    python scripts/backfill_vehicle_reminders.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.database import get_vehicles, get_vehicle_log, patch_vehicle
from app.fuelio_parser import derive_vehicle_reminder_fields


def main():
    vehicles = get_vehicles(active_only=False)
    for v in vehicles:
        entries = get_vehicle_log(v["id"], limit=100000)
        fields = derive_vehicle_reminder_fields(entries)
        if not fields:
            continue
        patch_vehicle(v["id"], fields)
        print(f"{v['name']} (id={v['id']}): {fields}")


if __name__ == "__main__":
    main()
