"""
SQLite database for vehicle-manager service.
Mirrors MemoryDB's vehicle methods from majordom-financiar.

Schema matches `majordom-financiar/backend/core/memory/database.py` lines 132-176,
plus `service_interval_km`, `service_interval_months`, `last_service_km`,
`last_service_date` (added via ALTER TABLE in MemoryDB._init_db).
"""
import os
import sqlite3
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def get_db_path() -> str:
    """Return the database path from VEHICLE_DB_PATH, defaulting to /app/data/vehicles.db."""
    return os.getenv("VEHICLE_DB_PATH", "/app/data/vehicles.db")


def _get_conn(db_path: str | None = None) -> sqlite3.Connection:
    """Get a SQLite connection with Row factory, WAL mode, foreign keys ON."""
    conn = sqlite3.connect(db_path or get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: str | None = None) -> None:
    """Create tables if they don't exist."""
    path = db_path or get_db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = _get_conn(path)
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS vehicles (
                id INTEGER PRIMARY KEY,
                user_id INTEGER,
                name TEXT,
                make TEXT,
                model TEXT,
                year INTEGER,
                vin TEXT,
                plate TEXT,
                fuel_type TEXT,
                tank_capacity REAL,
                km_initial INTEGER,
                apk_due TEXT,
                insurance_due TEXT,
                active INTEGER DEFAULT 1,
                notes TEXT,
                vehicle_type TEXT DEFAULT 'car',
                service_interval_km INTEGER DEFAULT NULL,
                service_interval_months INTEGER DEFAULT NULL,
                last_service_km REAL DEFAULT NULL,
                last_service_date TEXT DEFAULT NULL,
                apk_required INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS vehicle_log (
                id INTEGER PRIMARY KEY,
                vehicle_id INTEGER REFERENCES vehicles(id),
                date TEXT,
                odo_km REAL,
                entry_type TEXT,
                fuel_liters REAL,
                fuel_price_per_liter REAL,
                fuel_full_tank INTEGER,
                fuel_missed INTEGER,
                cost_total REAL,
                cost_currency TEXT DEFAULT 'EUR',
                remind_odo REAL,
                remind_date TEXT,
                repeat_odo REAL,
                repeat_months INTEGER,
                location TEXT,
                notes TEXT,
                financial_id TEXT,
                source TEXT,
                fuelio_unique_id TEXT,
                fuel_grade TEXT DEFAULT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(vehicle_id, fuelio_unique_id, entry_type)
            );
        """)
        conn.commit()

        # Existing databases predate apk_required — CREATE TABLE IF NOT EXISTS
        # above won't add it to an already-created table.
        existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(vehicles)")}
        if "apk_required" not in existing_columns:
            conn.execute("ALTER TABLE vehicles ADD COLUMN apk_required INTEGER DEFAULT 1")
            conn.commit()
            logger.info("Migrated: added apk_required column to vehicles")

        logger.info("Database initialized: %s", path)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Vehicle CRUD
# ---------------------------------------------------------------------------

def upsert_vehicle(data: dict, db_path: str | None = None) -> int:
    """Upsert a vehicle by (name, plate) case-insensitive match. Returns vehicle ID."""
    conn = _get_conn(db_path)
    try:
        row = conn.execute(
            "SELECT id FROM vehicles WHERE lower(name)=lower(?) AND lower(plate)=lower(?)",
            (data.get("name", ""), data.get("plate", ""))
        ).fetchone()
        if row:
            vid = row["id"]
            conn.execute("""
                UPDATE vehicles SET make=?,model=?,year=?,tank_capacity=?,fuel_type=?,active=?,vehicle_type=?
                WHERE id=?
            """, (data.get("make"), data.get("model"), data.get("year"),
                  data.get("tank_capacity"), data.get("fuel_type"), data.get("active", 1),
                  data.get("vehicle_type", "car"), vid))
            conn.commit()
            return vid
        cursor = conn.execute("""
            INSERT INTO vehicles (name,make,model,year,plate,tank_capacity,fuel_type,active,vehicle_type)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (data.get("name"), data.get("make"), data.get("model"), data.get("year"),
              data.get("plate"), data.get("tank_capacity"), data.get("fuel_type"),
              data.get("active", 1), data.get("vehicle_type", "car")))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_vehicles(active_only: bool = True, db_path: str | None = None) -> list[dict]:
    """Return vehicles with last_odo computed. Ordered by name."""
    conn = _get_conn(db_path)
    try:
        active_clause = "WHERE v.active = 1" if active_only else ""
        rows = conn.execute(f"""
            SELECT v.*, MAX(vl.odo_km) as last_odo
            FROM vehicles v
            LEFT JOIN vehicle_log vl ON vl.vehicle_id = v.id AND vl.odo_km IS NOT NULL
            {active_clause}
            GROUP BY v.id
            ORDER BY v.name
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_vehicle(vehicle_id: int, db_path: str | None = None) -> dict | None:
    """Return a single vehicle with last_odo computed. None if not found."""
    conn = _get_conn(db_path)
    try:
        row = conn.execute("""
            SELECT v.*, MAX(vl.odo_km) as last_odo
            FROM vehicles v
            LEFT JOIN vehicle_log vl ON vl.vehicle_id = v.id AND vl.odo_km IS NOT NULL
            WHERE v.id = ?
            GROUP BY v.id
        """, (vehicle_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def patch_vehicle(vehicle_id: int, updates: dict, db_path: str | None = None) -> bool:
    """Partial update of a vehicle. Only provided fields are updated.
    Accepts None values to clear a field.
    Returns True if vehicle was found and updated.
    """
    allowed_fields = {
        "vehicle_type", "apk_due", "insurance_due",
        "service_interval_km", "service_interval_months",
        "last_service_km", "last_service_date", "active",
        "apk_required",
    }
    set_clauses = []
    params = []
    for key, value in updates.items():
        if key in allowed_fields:
            set_clauses.append(f"{key} = ?")
            params.append(value)
    if not set_clauses:
        return False

    conn = _get_conn(db_path)
    try:
        cursor = conn.execute(
            f"UPDATE vehicles SET {', '.join(set_clauses)} WHERE id = ?",
            (*params, vehicle_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Vehicle Log CRUD
# ---------------------------------------------------------------------------

def insert_vehicle_log_entries(entries: list[dict], db_path: str | None = None) -> tuple[int, int]:
    """Batch INSERT OR IGNORE vehicle_log entries. Returns (inserted, skipped)."""
    conn = _get_conn(db_path)
    try:
        inserted = 0
        for e in entries:
            cursor = conn.execute("""
                INSERT OR IGNORE INTO vehicle_log
                  (vehicle_id, date, odo_km, entry_type, fuel_liters, fuel_price_per_liter,
                   fuel_full_tank, fuel_missed, cost_total, cost_currency, remind_odo,
                   remind_date, repeat_odo, repeat_months, location, notes,
                   source, fuelio_unique_id, financial_id, fuel_grade)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                e.get("vehicle_id"), e.get("date"), e.get("odo_km"), e.get("entry_type"),
                e.get("fuel_liters"), e.get("fuel_price_per_liter"), e.get("fuel_full_tank"),
                e.get("fuel_missed"), e.get("cost_total"), e.get("cost_currency", "EUR"),
                e.get("remind_odo"), e.get("remind_date"), e.get("repeat_odo"),
                e.get("repeat_months"), e.get("location"), e.get("notes"),
                e.get("source", "fuelio_import"), e.get("fuelio_unique_id"),
                e.get("financial_id"), e.get("fuel_grade"),
            ))
            inserted += cursor.rowcount
        conn.commit()
        skipped = len(entries) - inserted
        return inserted, skipped
    finally:
        conn.close()


def get_vehicle_log(vehicle_id: int, limit: int = 10, entry_type: str | None = None,
                    db_path: str | None = None) -> list[dict]:
    """Return log entries for a vehicle, ordered by date DESC, with vehicle_name joined."""
    conn = _get_conn(db_path)
    try:
        type_clause = ""
        params: list = [vehicle_id]
        if entry_type:
            type_clause = "AND vl.entry_type = ?"
            params.append(entry_type)
        params.append(limit)
        rows = conn.execute(f"""
            SELECT vl.*, v.name as vehicle_name
            FROM vehicle_log vl
            JOIN vehicles v ON v.id = vl.vehicle_id
            WHERE vl.vehicle_id = ?
            {type_clause}
            ORDER BY vl.date DESC
            LIMIT ?
        """, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_log_entry(entry_id: int, db_path: str | None = None) -> dict | None:
    """Return a single log entry with vehicle_name joined. None if not found."""
    conn = _get_conn(db_path)
    try:
        row = conn.execute("""
            SELECT vl.*, v.name as vehicle_name
            FROM vehicle_log vl
            JOIN vehicles v ON v.id = vl.vehicle_id
            WHERE vl.id = ?
        """, (entry_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_log_entry(entry_id: int, db_path: str | None = None) -> bool:
    """Delete a log entry. Returns True if deleted, False if not found."""
    conn = _get_conn(db_path)
    try:
        cursor = conn.execute("DELETE FROM vehicle_log WHERE id = ?", (entry_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_last_fuel_entry(vehicle_id: int, db_path: str | None = None) -> dict | None:
    """Return the most recent full-tank, non-missed fuel entry for a vehicle."""
    conn = _get_conn(db_path)
    try:
        row = conn.execute("""
            SELECT * FROM vehicle_log
            WHERE vehicle_id = ? AND entry_type = 'fuel' AND fuel_full_tank = 1 AND fuel_missed = 0
            ORDER BY date DESC LIMIT 1
        """, (vehicle_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def get_vehicle_stats_data(vehicle_id: int, period: str = "",
                           db_path: str | None = None) -> dict:
    """Compute vehicle stats. Mirrors `get_vehicle_stats` logic from vehicle.py.

    Returns structured JSON (not formatted text):
        profile, fill_count, total_liters, total_fuel_cost, total_distance,
        avg_consumption, cost_per_km, cost_count, total_other_cost, total_cost
    """
    conn = _get_conn(db_path)
    try:
        # Vehicle profile
        profile = conn.execute(
            "SELECT * FROM vehicles WHERE id = ?", (vehicle_id,)
        ).fetchone()
        if not profile:
            return {}
        profile_dict = dict(profile)

        # Period filter
        period_clause = ""
        params: list = [vehicle_id]
        if period:
            if len(period) == 7:  # YYYY-MM
                period_clause = "AND substr(date, 1, 7) = ?"
                params.append(period)
            elif len(period) == 4:  # YYYY
                period_clause = "AND substr(date, 1, 4) = ?"
                params.append(period)

        # Fuel stats
        fuel_rows = conn.execute(f"""
            SELECT
                COUNT(*) as fill_count,
                SUM(fuel_liters) as total_liters,
                SUM(cost_total) as total_fuel_cost,
                MAX(odo_km) as max_odo,
                MIN(odo_km) as min_odo
            FROM vehicle_log
            WHERE entry_type = 'fuel'
              AND fuel_full_tank = 1
              AND fuel_missed = 0
              AND fuel_liters IS NOT NULL
              AND vehicle_id = ?
              {period_clause}
        """, params).fetchone()

        fill_count = fuel_rows["fill_count"] or 0
        total_liters = float(fuel_rows["total_liters"] or 0.0)
        total_fuel_cost = float(fuel_rows["total_fuel_cost"] or 0.0)
        max_odo = fuel_rows["max_odo"] or 0
        min_odo = fuel_rows["min_odo"] or 0
        total_distance = max_odo - min_odo if max_odo > min_odo else 0

        avg_consumption = round(total_liters / total_distance * 100, 1) if total_distance > 0 else None
        cost_per_km = round(total_fuel_cost / total_distance, 3) if total_distance > 0 else None

        # Other costs
        other_params = [vehicle_id]
        period_clause2 = ""
        if period:
            if len(period) == 7:
                period_clause2 = "AND substr(date, 1, 7) = ?"
                other_params.append(period)
            elif len(period) == 4:
                period_clause2 = "AND substr(date, 1, 4) = ?"
                other_params.append(period)

        cost_rows = conn.execute(f"""
            SELECT
                COUNT(*) as cost_count,
                SUM(cost_total) as total_other_cost
            FROM vehicle_log
            WHERE entry_type != 'fuel'
              AND cost_total > 0
              AND vehicle_id = ?
              {period_clause2}
        """, other_params).fetchone()

        cost_count = cost_rows["cost_count"] or 0
        total_other_cost = float(cost_rows["total_other_cost"] or 0.0)
        total_cost = total_fuel_cost + total_other_cost

        return {
            "profile": profile_dict,
            "fill_count": fill_count,
            "total_liters": total_liters,
            "total_fuel_cost": total_fuel_cost,
            "total_distance": total_distance,
            "avg_consumption": avg_consumption,
            "cost_per_km": cost_per_km,
            "cost_count": cost_count,
            "total_other_cost": total_other_cost,
            "total_cost": total_cost,
        }
    finally:
        conn.close()
