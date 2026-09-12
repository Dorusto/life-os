"""
SQLite persistence for investment-manager.

This database (``/app/data/investments.db``) is this app's *own* source of
truth for holdings/transactions — deliberately separate from majordom-financiar's
``memory.db`` and from Actual Budget. It is not a violation of the "no financial
data in SQLite" rule, which is about majordom-financiar's own database where
Actual Budget owns *budget* data; vehicle-manager established the same
own-domain-data pattern (see the plan's section 2.3).

Schema shape is the plan's section 3, with two additions the build needed:

* ``transactions.cash_amount`` — signed cash value of an event. XTB's Cash
  Operations export carries only an ``Amount`` per row, not a per-unit price, so
  without this column cash-flow-based returns (XIRR/TWR) would lose information
  for imported rows.
* ``price_history`` and ``settings`` — historical closes are required to build
  the value series behind TWR, period change and benchmark comparison;
  ``settings`` holds the one user-facing setting (benchmark ticker) plus the
  fallback assumed return for goal projections.

All functions accept an optional ``db_path`` so tests can point at a temp file
instead of the container volume.
"""
import logging
import os
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)


def get_db_path() -> str:
    """Database path from INVESTMENT_DB_PATH, defaulting to the container volume."""
    return os.getenv("INVESTMENT_DB_PATH", "/app/data/investments.db")


def _get_conn(db_path: str | None = None) -> sqlite3.Connection:
    """Connection with Row factory, WAL journaling and foreign keys enabled."""
    conn = sqlite3.connect(db_path or get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS securities (
    id INTEGER PRIMARY KEY,
    ticker TEXT NOT NULL UNIQUE,
    name TEXT,
    asset_type TEXT,
    currency TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    security_id INTEGER NOT NULL REFERENCES securities(id),
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity REAL,
    price_per_unit REAL,
    fees REAL DEFAULT 0,
    currency TEXT NOT NULL,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    cash_amount REAL
);

-- One row per XTB operation id, so re-importing an overlapping report is a
-- no-op rather than a duplicate (plan section 5). A partial unique index would
-- be nicer, but SQLite supports them and this keeps the dedup explicit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id
    ON transactions(external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS price_cache (
    ticker TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (ticker)
);

CREATE TABLE IF NOT EXISTS price_history (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    close REAL NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS fx_cache (
    pair TEXT NOT NULL,
    rate REAL NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (pair)
);

CREATE TABLE IF NOT EXISTS target_allocation (
    target_key TEXT PRIMARY KEY,
    target_percentage REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    target_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


DEFAULT_SETTINGS = {
    "benchmark_ticker": "VWCE.DE",
    "assumed_annual_return": "0.07",
}


def init_db(db_path: str | None = None) -> None:
    """Create tables/indexes if missing and seed default settings."""
    path = db_path or get_db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = _get_conn(path)
    try:
        conn.executescript(SCHEMA)
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )
        conn.commit()
        logger.info("Database initialized: %s", path)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Securities
# ---------------------------------------------------------------------------

def upsert_security(ticker: str, name: str | None, asset_type: str | None,
                    currency: str, db_path: str | None = None) -> int:
    """Insert a security, or return the existing id for the same ticker.

    Name/asset_type/currency are only filled in on insert — re-adding an
    existing ticker must not blank metadata the user already curated.
    """
    ticker = ticker.strip()
    conn = _get_conn(db_path)
    try:
        row = conn.execute("SELECT id FROM securities WHERE ticker = ?", (ticker,)).fetchone()
        if row:
            return row["id"]
        cur = conn.execute(
            "INSERT INTO securities (ticker, name, asset_type, currency) VALUES (?,?,?,?)",
            (ticker, name, asset_type, currency),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_securities(db_path: str | None = None) -> list[dict]:
    """All securities, alphabetical by ticker."""
    conn = _get_conn(db_path)
    try:
        rows = conn.execute("SELECT * FROM securities ORDER BY ticker").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_security(security_id: int, db_path: str | None = None) -> dict | None:
    conn = _get_conn(db_path)
    try:
        row = conn.execute("SELECT * FROM securities WHERE id = ?", (security_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_security_by_ticker(ticker: str, db_path: str | None = None) -> dict | None:
    conn = _get_conn(db_path)
    try:
        row = conn.execute("SELECT * FROM securities WHERE ticker = ?", (ticker,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_security(security_id: int, db_path: str | None = None) -> bool:
    """Delete a security and all of its transactions (FK cascade by hand)."""
    conn = _get_conn(db_path)
    try:
        conn.execute("DELETE FROM transactions WHERE security_id = ?", (security_id,))
        cur = conn.execute("DELETE FROM securities WHERE id = ?", (security_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

def insert_transaction(data: dict, db_path: str | None = None) -> tuple[int | None, bool]:
    """Insert one transaction. Returns (id, inserted).

    ``inserted=False`` means an existing row with the same ``external_id``
    already exists and was left untouched (import idempotency).
    """
    conn = _get_conn(db_path)
    try:
        external_id = data.get("external_id")
        if external_id:
            existing = conn.execute(
                "SELECT id FROM transactions WHERE external_id = ?", (external_id,)
            ).fetchone()
            if existing:
                return existing["id"], False

        cur = conn.execute(
            """
            INSERT INTO transactions
                (security_id, date, type, quantity, price_per_unit, fees, currency,
                 notes, source, external_id, cash_amount)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                data["security_id"], data["date"], data["type"], data.get("quantity"),
                data.get("price_per_unit"), data.get("fees", 0.0), data["currency"],
                data.get("notes"), data.get("source", "manual"), external_id,
                data.get("cash_amount"),
            ),
        )
        conn.commit()
        return cur.lastrowid, True
    finally:
        conn.close()


def get_transactions(security_id: int | None = None, type: str | None = None,
                     start_date: str | None = None, end_date: str | None = None,
                     limit: int | None = None, db_path: str | None = None) -> list[dict]:
    """Transactions joined with their security's ticker/name, newest first."""
    clauses = []
    params: list = []
    if security_id is not None:
        clauses.append("t.security_id = ?")
        params.append(security_id)
    if type:
        clauses.append("t.type = ?")
        params.append(type)
    if start_date:
        clauses.append("t.date >= ?")
        params.append(start_date)
    if end_date:
        clauses.append("t.date <= ?")
        params.append(end_date)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT t.*, s.ticker AS ticker, s.name AS security_name
        FROM transactions t
        JOIN securities s ON s.id = t.security_id
        {where}
        ORDER BY t.date DESC, t.id DESC
    """
    if limit:
        sql += " LIMIT ?"
        params.append(limit)

    conn = _get_conn(db_path)
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_transaction(transaction_id: int, db_path: str | None = None) -> dict | None:
    conn = _get_conn(db_path)
    try:
        row = conn.execute(
            """
            SELECT t.*, s.ticker AS ticker, s.name AS security_name
            FROM transactions t JOIN securities s ON s.id = t.security_id
            WHERE t.id = ?
            """,
            (transaction_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_transaction(transaction_id: int, db_path: str | None = None) -> bool:
    conn = _get_conn(db_path)
    try:
        cur = conn.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def external_id_exists(external_id: str, db_path: str | None = None) -> bool:
    conn = _get_conn(db_path)
    try:
        row = conn.execute(
            "SELECT 1 FROM transactions WHERE external_id = ?", (external_id,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Price / FX caches
# ---------------------------------------------------------------------------

def get_cached_price(ticker: str, db_path: str | None = None) -> dict | None:
    conn = _get_conn(db_path)
    try:
        row = conn.execute("SELECT * FROM price_cache WHERE ticker = ?", (ticker,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def upsert_price(ticker: str, price: float, currency: str, fetched_at: str,
                 db_path: str | None = None) -> None:
    conn = _get_conn(db_path)
    try:
        conn.execute(
            """
            INSERT INTO price_cache (ticker, price, currency, fetched_at) VALUES (?,?,?,?)
            ON CONFLICT(ticker) DO UPDATE SET price=excluded.price,
                currency=excluded.currency, fetched_at=excluded.fetched_at
            """,
            (ticker, price, currency, fetched_at),
        )
        conn.commit()
    finally:
        conn.close()


def get_price_history(ticker: str, db_path: str | None = None) -> list[dict]:
    """Cached daily closes for a ticker, oldest first."""
    conn = _get_conn(db_path)
    try:
        rows = conn.execute(
            "SELECT date, close FROM price_history WHERE ticker = ? ORDER BY date",
            (ticker,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_price_history_fetched_at(ticker: str, db_path: str | None = None) -> str | None:
    """Newest fetch timestamp for a ticker's cached history (None if empty)."""
    conn = _get_conn(db_path)
    try:
        row = conn.execute(
            "SELECT MAX(fetched_at) AS fetched_at FROM price_history WHERE ticker = ?",
            (ticker,),
        ).fetchone()
        return row["fetched_at"] if row else None
    finally:
        conn.close()


def upsert_price_history(ticker: str, points: list[tuple[str, float]], fetched_at: str,
                         db_path: str | None = None) -> None:
    conn = _get_conn(db_path)
    try:
        conn.executemany(
            """
            INSERT INTO price_history (ticker, date, close, fetched_at) VALUES (?,?,?,?)
            ON CONFLICT(ticker, date) DO UPDATE SET close=excluded.close,
                fetched_at=excluded.fetched_at
            """,
            [(ticker, d, c, fetched_at) for d, c in points],
        )
        conn.commit()
    finally:
        conn.close()


def get_cached_fx(pair: str, db_path: str | None = None) -> dict | None:
    conn = _get_conn(db_path)
    try:
        row = conn.execute("SELECT * FROM fx_cache WHERE pair = ?", (pair,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def upsert_fx(pair: str, rate: float, fetched_at: str, db_path: str | None = None) -> None:
    conn = _get_conn(db_path)
    try:
        conn.execute(
            """
            INSERT INTO fx_cache (pair, rate, fetched_at) VALUES (?,?,?)
            ON CONFLICT(pair) DO UPDATE SET rate=excluded.rate, fetched_at=excluded.fetched_at
            """,
            (pair, rate, fetched_at),
        )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def get_settings(db_path: str | None = None) -> dict[str, str]:
    conn = _get_conn(db_path)
    try:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        merged = dict(DEFAULT_SETTINGS)
        merged.update({r["key"]: r["value"] for r in rows})
        return merged
    finally:
        conn.close()


def get_setting(key: str, default: str | None = None, db_path: str | None = None) -> str | None:
    conn = _get_conn(db_path)
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        if row:
            return row["value"]
        return DEFAULT_SETTINGS.get(key, default)
    finally:
        conn.close()


def set_setting(key: str, value: str, db_path: str | None = None) -> None:
    conn = _get_conn(db_path)
    try:
        conn.execute(
            """
            INSERT INTO settings (key, value) VALUES (?,?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value
            """,
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Target allocation
# ---------------------------------------------------------------------------

def get_target_allocation(db_path: str | None = None) -> list[dict]:
    conn = _get_conn(db_path)
    try:
        rows = conn.execute(
            "SELECT target_key, target_percentage FROM target_allocation ORDER BY target_key"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def replace_target_allocation(targets: list[dict], db_path: str | None = None) -> None:
    """Replace the whole target set — the Rebalancing page edits it as one table,
    so a full replace keeps read and write consistent (no orphaned stale targets)."""
    conn = _get_conn(db_path)
    try:
        conn.execute("DELETE FROM target_allocation")
        conn.executemany(
            "INSERT INTO target_allocation (target_key, target_percentage) VALUES (?,?)",
            [(t["target_key"], t["target_percentage"]) for t in targets],
        )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------

def create_goal(name: str, target_amount: float, target_date: str,
                db_path: str | None = None) -> int:
    conn = _get_conn(db_path)
    try:
        cur = conn.execute(
            "INSERT INTO goals (name, target_amount, target_date) VALUES (?,?,?)",
            (name, target_amount, target_date),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_goals(db_path: str | None = None) -> list[dict]:
    conn = _get_conn(db_path)
    try:
        rows = conn.execute("SELECT * FROM goals ORDER BY target_date").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_goal(goal_id: int, db_path: str | None = None) -> dict | None:
    conn = _get_conn(db_path)
    try:
        row = conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_goal(goal_id: int, db_path: str | None = None) -> bool:
    conn = _get_conn(db_path)
    try:
        cur = conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
