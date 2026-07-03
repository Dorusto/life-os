#!/usr/bin/env python3
"""
One-off migration script: copy vehicles and vehicle_log data from Majordom's
memory.db into the vehicle-manager service's vehicles.db.

Usage:
    python scripts/migrate_from_majordom.py <source_memory.db> <dest_vehicles.db>

Example:
    python scripts/migrate_from_majordom.py /path/to/memory.db /path/to/vehicles.db

This script:
1. Initializes the destination schema (creates tables if missing).
2. Reads all rows from `vehicles` and `vehicle_log` in the source.
3. Writes them into the destination with INSERT OR REPLACE, preserving original IDs.
4. Prints a summary of rows copied per table.

WARNING: Always run against a COPY of the live memory.db, never the live file.
"""
import sqlite3
import sys
from pathlib import Path

# Add parent dir so we can import app.database
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.database import init_db, _get_conn


def copy_table(conn_src: sqlite3.Connection, conn_dst: sqlite3.Connection,
               table: str) -> int:
    """Copy all rows from source to destination for the given table.
    Uses INSERT OR REPLACE to preserve original IDs.
    Returns the number of rows copied."""
    rows = conn_src.execute(f"SELECT * FROM {table}").fetchall()
    if not rows:
        return 0

    # Get column names from source
    col_names = [desc[0] for desc in conn_src.execute(
        f"SELECT * FROM {table} LIMIT 0"
    ).description]

    placeholders = ", ".join("?" for _ in col_names)
    columns = ", ".join(col_names)

    count = 0
    for row in rows:
        values = [row[c] for c in col_names]
        conn_dst.execute(
            f"INSERT OR REPLACE INTO {table} ({columns}) VALUES ({placeholders})",
            values,
        )
        count += 1

    conn_dst.commit()
    return count


def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/migrate_from_majordom.py <source_memory.db> <dest_vehicles.db>")
        sys.exit(1)

    src_path = sys.argv[1]
    dst_path = sys.argv[2]

    # Validate source exists
    if not Path(src_path).exists():
        print(f"Error: source file not found: {src_path}")
        sys.exit(1)

    print(f"Source: {src_path}")
    print(f"Destination: {dst_path}")

    # Initialize destination schema
    print("Initializing destination schema...")
    init_db(dst_path)

    # Open connections
    conn_src = sqlite3.connect(src_path)
    conn_src.row_factory = sqlite3.Row
    conn_dst = _get_conn(dst_path)

    try:
        # Copy vehicles
        vehicles_copied = copy_table(conn_src, conn_dst, "vehicles")
        print(f"  vehicles: {vehicles_copied} rows copied")

        # Copy vehicle_log
        log_copied = copy_table(conn_src, conn_dst, "vehicle_log")
        print(f"  vehicle_log: {log_copied} rows copied")

        print(f"\nMigration complete: {vehicles_copied + log_copied} total rows copied.")
    finally:
        conn_src.close()
        conn_dst.close()


if __name__ == "__main__":
    main()
