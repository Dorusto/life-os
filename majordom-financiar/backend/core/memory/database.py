from __future__ import annotations
"""
Local database (SQLite) for the majordom's memory.

Stores:
- Processed transaction history
- Merchant → category associations (for learning)
- User feedback
"""
import sqlite3
from pathlib import Path
from datetime import datetime, date
from dataclasses import dataclass
import logging
import json

logger = logging.getLogger(__name__)


@dataclass
class TransactionRecord:
    """A processed and stored transaction."""
    id: int | None = None
    merchant: str = ""
    amount: float = 0.0
    category_id: str = ""
    date: str = ""
    raw_ocr_text: str = ""
    confidence: float = 0.0
    user_confirmed: bool = False
    created_at: str = ""
    actual_budget_id: str = ""  # ID from Actual Budget


@dataclass
class MerchantMapping:
    """Learned merchant → category association."""
    merchant: str
    category_id: str
    times_seen: int = 1
    last_seen: str = ""


class MemoryDB:
    """SQLite interface for the majordom's memory."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")  # Write-Ahead Logging
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self):
        """Create tables if they don't exist."""
        conn = self._get_conn()
        try:
            conn.executescript("""
                -- LEGACY — local copy of transactions; violates architectural principle.
                -- Financial data belongs in Actual Budget, not SQLite.
                -- Used only by the Telegram bot (maintenance mode).
                -- To be removed when the Telegram bot is retired.
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    merchant TEXT NOT NULL,
                    amount REAL NOT NULL,
                    category_id TEXT NOT NULL DEFAULT 'other',
                    date TEXT NOT NULL,
                    raw_ocr_text TEXT DEFAULT '',
                    confidence REAL DEFAULT 0.0,
                    user_confirmed BOOLEAN DEFAULT 0,
                    actual_budget_id TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS merchant_mappings (
                    merchant TEXT PRIMARY KEY,
                    category_id TEXT NOT NULL,
                    times_seen INTEGER DEFAULT 1,
                    last_seen TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS category_keywords (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    keyword TEXT NOT NULL,
                    category_id TEXT NOT NULL,
                    weight REAL DEFAULT 1.0,
                    source TEXT DEFAULT 'user',
                    UNIQUE(keyword, category_id)
                );

                -- LEGACY — local copy of budget limits; violates architectural principle.
                -- Budget limits belong in Actual Budget.
                -- Used only by the Telegram bot (maintenance mode).
                -- To be removed when the Telegram bot is retired.
                CREATE TABLE IF NOT EXISTS budget_limits (
                    category_name TEXT PRIMARY KEY,
                    monthly_limit REAL NOT NULL,
                    updated_at TEXT DEFAULT (datetime('now'))
                );

                CREATE INDEX IF NOT EXISTS idx_transactions_merchant
                    ON transactions(merchant);
                CREATE INDEX IF NOT EXISTS idx_transactions_date
                    ON transactions(date);
                CREATE INDEX IF NOT EXISTS idx_transactions_category
                    ON transactions(category_id);

                CREATE TABLE IF NOT EXISTS csv_profiles (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_name  TEXT NOT NULL DEFAULT '',
                    header_sig   TEXT NOT NULL UNIQUE,
                    col_date     TEXT NOT NULL DEFAULT '',
                    col_merchant TEXT NOT NULL DEFAULT '',
                    col_amount   TEXT NOT NULL DEFAULT '',
                    col_currency TEXT NOT NULL DEFAULT '',
                    col_direction TEXT NOT NULL DEFAULT '',
                    col_description TEXT NOT NULL DEFAULT '',
                    expense_indicator TEXT NOT NULL DEFAULT '',
                    date_format  TEXT NOT NULL DEFAULT '%Y-%m-%d',
                    delimiter    TEXT NOT NULL DEFAULT ',',
                    decimal_sep  TEXT NOT NULL DEFAULT '.',
                    encoding     TEXT NOT NULL DEFAULT 'utf-8',
                    confirmed    INTEGER NOT NULL DEFAULT 0,
                    created_at   TEXT DEFAULT (datetime('now'))
                );
            """)
            conn.commit()
            logger.info(f"Database initialized: {self.db_path}")
        finally:
            conn.close()

    # --- Transactions ---

    def save_transaction(self, record: TransactionRecord) -> int:
        """Save a transaction and return its ID."""
        conn = self._get_conn()
        try:
            cursor = conn.execute("""
                INSERT INTO transactions
                    (merchant, amount, category_id, date, raw_ocr_text,
                     confidence, user_confirmed, actual_budget_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record.merchant, record.amount, record.category_id,
                record.date, record.raw_ocr_text, record.confidence,
                record.user_confirmed, record.actual_budget_id
            ))
            conn.commit()
            tx_id = cursor.lastrowid
            logger.info(f"Transaction saved #{tx_id}: {record.merchant} {record.amount}")
            return tx_id
        finally:
            conn.close()

    def get_transactions(
        self,
        month: int | None = None,
        year: int | None = None,
        category_id: str | None = None,
        limit: int = 100
    ) -> list[TransactionRecord]:
        """List transactions with optional filters."""
        conn = self._get_conn()
        try:
            query = "SELECT * FROM transactions WHERE 1=1"
            params = []

            if month and year:
                query += " AND date LIKE ?"
                params.append(f"{year}-{month:02d}%")
            elif year:
                query += " AND date LIKE ?"
                params.append(f"{year}%")

            if category_id:
                query += " AND category_id = ?"
                params.append(category_id)

            query += " ORDER BY date DESC LIMIT ?"
            params.append(limit)

            rows = conn.execute(query, params).fetchall()
            return [
                TransactionRecord(**dict(row)) for row in rows
            ]
        finally:
            conn.close()

    def get_monthly_stats(
        self, month: int | None = None, year: int | None = None
    ) -> dict:
        """Aggregated monthly statistics."""
        if not month or not year:
            now = datetime.now()
            month = month or now.month
            year = year or now.year

        conn = self._get_conn()
        try:
            date_prefix = f"{year}-{month:02d}"

            # Total by category
            rows = conn.execute("""
                SELECT category_id, COUNT(*) as count, SUM(amount) as total
                FROM transactions
                WHERE date LIKE ?
                GROUP BY category_id
                ORDER BY total DESC
            """, (f"{date_prefix}%",)).fetchall()

            categories = {
                row["category_id"]: {
                    "count": row["count"],
                    "total": row["total"]
                }
                for row in rows
            }

            # Grand total
            total = sum(c["total"] for c in categories.values())
            count = sum(c["count"] for c in categories.values())

            return {
                "month": month,
                "year": year,
                "total": total,
                "count": count,
                "categories": categories
            }
        finally:
            conn.close()

    # --- Merchant Mappings (for learning) ---

    def get_merchant_category(self, merchant: str) -> MerchantMapping | None:
        """Find the category associated with a merchant."""
        conn = self._get_conn()
        try:
            # Exact match
            row = conn.execute(
                "SELECT * FROM merchant_mappings WHERE merchant = ?",
                (merchant.lower(),)
            ).fetchone()

            if row:
                return MerchantMapping(**dict(row))

            # Fuzzy search (contains)
            row = conn.execute(
                "SELECT * FROM merchant_mappings WHERE ? LIKE '%' || merchant || '%' "
                "OR merchant LIKE '%' || ? || '%' "
                "ORDER BY times_seen DESC LIMIT 1",
                (merchant.lower(), merchant.lower())
            ).fetchone()

            if row:
                return MerchantMapping(**dict(row))

            return None
        finally:
            conn.close()

    def save_merchant_mapping(self, merchant: str, category_id: str):
        """Save/update the merchant → category association."""
        conn = self._get_conn()
        try:
            conn.execute("""
                INSERT INTO merchant_mappings (merchant, category_id, times_seen, last_seen)
                VALUES (?, ?, 1, datetime('now'))
                ON CONFLICT(merchant) DO UPDATE SET
                    category_id = excluded.category_id,
                    times_seen = times_seen + 1,
                    last_seen = datetime('now')
            """, (merchant.lower(), category_id))
            conn.commit()
            logger.info(f"Mapping saved: '{merchant}' → '{category_id}'")
        finally:
            conn.close()

    def update_transaction_category(self, tx_id: int, category_id: str):
        """Update a transaction's category (after user feedback)."""
        conn = self._get_conn()
        try:
            conn.execute("""
                UPDATE transactions
                SET category_id = ?, user_confirmed = 1
                WHERE id = ?
            """, (category_id, tx_id))
            conn.commit()
            logger.info(f"Transaction #{tx_id} updated → '{category_id}'")
        finally:
            conn.close()

    # --- Keywords ---

    def add_keyword(self, keyword: str, category_id: str, weight: float = 1.0):
        """Add a keyword for a category."""
        conn = self._get_conn()
        try:
            conn.execute("""
                INSERT INTO category_keywords (keyword, category_id, weight, source)
                VALUES (?, ?, ?, 'user')
                ON CONFLICT(keyword, category_id) DO UPDATE SET
                    weight = weight + 0.1
            """, (keyword.lower(), category_id, weight))
            conn.commit()
        finally:
            conn.close()

    def get_all_keywords(self) -> dict[str, list[tuple[str, float]]]:
        """Return all keywords grouped by category."""
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT keyword, category_id, weight FROM category_keywords"
            ).fetchall()

            result: dict[str, list[tuple[str, float]]] = {}
            for row in rows:
                cat = row["category_id"]
                if cat not in result:
                    result[cat] = []
                result[cat].append((row["keyword"], row["weight"]))

            return result
        finally:
            conn.close()

    # --- Budget Limits ---

    def set_budget_limit(self, category_name: str, limit: float):
        """Set the monthly limit for a category."""
        conn = self._get_conn()
        try:
            conn.execute("""
                INSERT INTO budget_limits (category_name, monthly_limit, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(category_name) DO UPDATE SET
                    monthly_limit = excluded.monthly_limit,
                    updated_at = datetime('now')
            """, (category_name, limit))
            conn.commit()
        finally:
            conn.close()

    def get_budget_limits(self) -> dict[str, float]:
        """Return all monthly limits {category_name: limit}."""
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT category_name, monthly_limit FROM budget_limits"
            ).fetchall()
            return {row["category_name"]: row["monthly_limit"] for row in rows}
        finally:
            conn.close()

    def get_budget_limit(self, category_name: str) -> float | None:
        """Return the limit for a specific category."""
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT monthly_limit FROM budget_limits WHERE category_name = ?",
                (category_name,)
            ).fetchone()
            return row["monthly_limit"] if row else None
        finally:
            conn.close()

    # --- CSV Profiles ---

    def save_csv_profile(self, profile) -> int:
        """Save a CSV profile and return its ID. Updates if it already exists."""
        conn = self._get_conn()
        try:
            cursor = conn.execute("""
                INSERT INTO csv_profiles
                    (source_name, header_sig, col_date, col_merchant, col_amount,
                     col_currency, col_direction, col_description, expense_indicator,
                     date_format, delimiter, decimal_sep, encoding, confirmed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(header_sig) DO UPDATE SET
                    source_name=excluded.source_name,
                    col_date=excluded.col_date,
                    col_merchant=excluded.col_merchant,
                    col_amount=excluded.col_amount,
                    col_currency=excluded.col_currency,
                    col_direction=excluded.col_direction,
                    col_description=excluded.col_description,
                    expense_indicator=excluded.expense_indicator,
                    date_format=excluded.date_format,
                    delimiter=excluded.delimiter,
                    decimal_sep=excluded.decimal_sep,
                    encoding=excluded.encoding,
                    confirmed=excluded.confirmed
            """, (
                profile.source_name, profile.header_sig,
                profile.col_date, profile.col_merchant, profile.col_amount,
                profile.col_currency, profile.col_direction, profile.col_description,
                profile.expense_indicator, profile.date_format,
                profile.delimiter, profile.decimal_sep, profile.encoding,
                int(profile.confirmed),
            ))
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def get_csv_profile_by_sig(self, header_sig: str):
        """Find a CSV profile by header signature. Returns CsvProfile or None."""
        from backend.core.csv_importer.profiles import CsvProfile
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM csv_profiles WHERE header_sig = ?", (header_sig,)
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            d["confirmed"] = bool(d["confirmed"])
            d.pop("created_at", None)
            return CsvProfile(**d)
        finally:
            conn.close()

    def get_all_csv_profiles(self) -> list:
        """Return all saved CSV profiles."""
        from backend.core.csv_importer.profiles import CsvProfile
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT * FROM csv_profiles ORDER BY source_name"
            ).fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["confirmed"] = bool(d["confirmed"])
                d.pop("created_at", None)
                result.append(CsvProfile(**d))
            return result
        finally:
            conn.close()
