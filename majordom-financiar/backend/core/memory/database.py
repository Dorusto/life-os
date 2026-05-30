from __future__ import annotations
"""
Local database (SQLite) for the majordom's memory.

Stores:
- Merchant → category associations (for learning)
- Category keywords
- CSV import profiles
- Onboarding state
"""
import sqlite3
from pathlib import Path
from datetime import datetime, date
from dataclasses import dataclass
import logging
import json

logger = logging.getLogger(__name__)


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
                    col_transfer_indicator TEXT NOT NULL DEFAULT '',
                    transfer_indicator_value TEXT NOT NULL DEFAULT '',
                    created_at   TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS user_preferences (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS onboarding_state (
                    id INTEGER PRIMARY KEY,
                    user_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
                    current_question INTEGER NOT NULL DEFAULT 1,
                    answers TEXT NOT NULL DEFAULT '{}',
                    phase INTEGER NOT NULL DEFAULT 1,
                    completed_at TEXT DEFAULT NULL,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );
            """)
            conn.commit()
            # Migrate existing csv_profiles table — add columns added after initial schema
            for col, definition in [
                ("col_transfer_indicator", "TEXT NOT NULL DEFAULT ''"),
                ("transfer_indicator_value", "TEXT NOT NULL DEFAULT ''"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE csv_profiles ADD COLUMN {col} {definition}")
                    conn.commit()
                except Exception:
                    pass  # column already exists
            logger.info(f"Database initialized: {self.db_path}")
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

    # --- CSV Profiles ---

    def save_csv_profile(self, profile) -> int:
        """Save a CSV profile and return its ID. Updates if it already exists."""
        conn = self._get_conn()
        try:
            cursor = conn.execute("""
                INSERT INTO csv_profiles
                    (source_name, header_sig, col_date, col_merchant, col_amount,
                     col_currency, col_direction, col_description, expense_indicator,
                     date_format, delimiter, decimal_sep, encoding, confirmed,
                     col_transfer_indicator, transfer_indicator_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    confirmed=excluded.confirmed,
                    col_transfer_indicator=excluded.col_transfer_indicator,
                    transfer_indicator_value=excluded.transfer_indicator_value
            """, (
                profile.source_name, profile.header_sig,
                profile.col_date, profile.col_merchant, profile.col_amount,
                profile.col_currency, profile.col_direction, profile.col_description,
                profile.expense_indicator, profile.date_format,
                profile.delimiter, profile.decimal_sep, profile.encoding,
                int(profile.confirmed),
                profile.col_transfer_indicator, profile.transfer_indicator_value,
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

    def seed_builtin_profiles(self) -> None:
        """Upsert built-in bank profiles — always overwrites so bad Ollama detections are corrected."""
        import hashlib
        from backend.core.csv_importer.builtin_profiles import BUILTIN_PROFILES
        from backend.core.csv_importer.profiles import CsvProfile

        for entry in BUILTIN_PROFILES:
            headers = entry["headers"]
            normalized = ",".join(sorted(h.strip().lower() for h in headers))
            sig = hashlib.md5(normalized.encode()).hexdigest()[:12]
            profile = CsvProfile(header_sig=sig, **entry["profile"])
            self.save_csv_profile(profile)

    # --- User Preferences ---

    def get_preference(self, key: str) -> str | None:
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT value FROM user_preferences WHERE key = ?", (key,)
            ).fetchone()
            return row["value"] if row else None
        finally:
            conn.close()

    def set_preference(self, key: str, value: str):
        conn = self._get_conn()
        try:
            conn.execute("""
                INSERT INTO user_preferences (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
            """, (key, value))
            conn.commit()
        finally:
            conn.close()

    # --- Onboarding State ---

    def get_onboarding_state(self, user_id: str = "default") -> dict | None:
        """Get onboarding state for a user. Returns None if no active session."""
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM onboarding_state WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            d["answers"] = json.loads(d.get("answers", "{}"))
            return d
        finally:
            conn.close()

    def save_onboarding_state(self, user_id: str, state: dict):
        """Upsert onboarding state for a user."""
        conn = self._get_conn()
        try:
            answers_json = json.dumps(state.get("answers", {}))
            conn.execute("""
                INSERT INTO onboarding_state (user_id, current_question, answers, phase, completed_at, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(user_id) DO UPDATE SET
                    current_question = excluded.current_question,
                    answers = excluded.answers,
                    phase = excluded.phase,
                    completed_at = excluded.completed_at,
                    updated_at = datetime('now')
            """, (
                user_id,
                state.get("current_question", 1),
                answers_json,
                state.get("phase", 1),
                state.get("completed_at"),
            ))
            conn.commit()
        finally:
            conn.close()

    def clear_onboarding_state(self, user_id: str = "default"):
        """Delete onboarding state for a user."""
        conn = self._get_conn()
        try:
            conn.execute(
                "DELETE FROM onboarding_state WHERE user_id = ?",
                (user_id,)
            )
            conn.commit()
        finally:
            conn.close()
