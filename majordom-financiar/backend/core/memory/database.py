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

                CREATE TABLE IF NOT EXISTS notification_rules (
                    rule_type   TEXT PRIMARY KEY,
                    enabled     INTEGER NOT NULL DEFAULT 1,
                    config      TEXT NOT NULL DEFAULT '{}',
                    updated_at  TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS notification_log (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    rule_type   TEXT NOT NULL,
                    sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
                    payload     TEXT NOT NULL DEFAULT '{}'
                );

                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     TEXT NOT NULL DEFAULT 'default',
                    endpoint    TEXT NOT NULL UNIQUE,
                    p256dh      TEXT NOT NULL,
                    auth        TEXT NOT NULL,
                    user_agent  TEXT NOT NULL DEFAULT '',
                    created_at  TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS pending_review (
                    financial_id TEXT PRIMARY KEY,
                    imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
                    notified_at  TEXT DEFAULT NULL
                );

                CREATE TABLE IF NOT EXISTS chat_history (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id   TEXT NOT NULL,
                    role      TEXT NOT NULL,
                    content   TEXT NOT NULL,
                    ts        INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id, ts);

                """)
            conn.commit()
            # Migrate existing tables — add columns added after initial schema
            for col, definition in [
                ("col_transfer_indicator", "TEXT NOT NULL DEFAULT ''"),
                ("transfer_indicator_value", "TEXT NOT NULL DEFAULT ''"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE csv_profiles ADD COLUMN {col} {definition}")
                    conn.commit()
                except Exception:
                    pass  # column already exists
            # Drop financial data accidentally duplicated into pending_review (#99 audit) —
            # only financial_id + count are ever read (notification_service._check_pending_review)
            for col in ("merchant", "amount", "date", "category_name"):
                try:
                    conn.execute(f"ALTER TABLE pending_review DROP COLUMN {col}")
                    conn.commit()
                except Exception:
                    pass  # column already dropped, or table freshly created without it
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

    # --- Notification Rules ---

    def get_notification_rule(self, rule_type: str) -> dict | None:
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM notification_rules WHERE rule_type = ?", (rule_type,)
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            d["config"] = json.loads(d["config"])
            d["enabled"] = bool(d["enabled"])
            return d
        finally:
            conn.close()

    def upsert_notification_rule(self, rule_type: str, enabled: bool, config: dict):
        conn = self._get_conn()
        try:
            conn.execute("""
                INSERT INTO notification_rules (rule_type, enabled, config, updated_at)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(rule_type) DO UPDATE SET
                    enabled = excluded.enabled,
                    config = excluded.config,
                    updated_at = datetime('now')
            """, (rule_type, int(enabled), json.dumps(config)))
            conn.commit()
        finally:
            conn.close()

    def get_all_notification_rules(self) -> list[dict]:
        conn = self._get_conn()
        try:
            rows = conn.execute("SELECT * FROM notification_rules ORDER BY rule_type").fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["config"] = json.loads(d["config"])
                d["enabled"] = bool(d["enabled"])
                result.append(d)
            return result
        finally:
            conn.close()

    # --- Notification Log ---

    def log_notification(self, rule_type: str, payload: dict):
        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT INTO notification_log (rule_type, payload) VALUES (?, ?)",
                (rule_type, json.dumps(payload))
            )
            conn.commit()
        finally:
            conn.close()

    def get_last_notification(self, rule_type: str) -> dict | None:
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM notification_log WHERE rule_type = ? ORDER BY sent_at DESC LIMIT 1",
                (rule_type,)
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            d["payload"] = json.loads(d["payload"])
            return d
        finally:
            conn.close()

    # --- Push Subscriptions ---

    def save_push_subscription(self, user_id: str, endpoint: str, p256dh: str, auth: str, user_agent: str):
        conn = self._get_conn()
        try:
            conn.execute("""
                INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(endpoint) DO UPDATE SET
                    user_id = excluded.user_id,
                    p256dh = excluded.p256dh,
                    auth = excluded.auth,
                    user_agent = excluded.user_agent
            """, (user_id, endpoint, p256dh, auth, user_agent))
            conn.commit()
        finally:
            conn.close()

    def get_all_push_subscriptions(self) -> list[dict]:
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT * FROM push_subscriptions ORDER BY created_at"
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def get_push_subscriptions(self, user_id: str = "default") -> list[dict]:
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at",
                (user_id,)
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def delete_push_subscription(self, endpoint: str):
        conn = self._get_conn()
        try:
            conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
            conn.commit()
        finally:
            conn.close()

    # --- Pending Review ---

    def add_pending_reviews(self, financial_ids: list[str]):
        """Flag low-confidence categorized transactions for a later review nudge.

        Only the AB transaction ID is stored — the actual transaction data
        (merchant, amount, date, category) lives in Actual Budget, the source
        of truth. Uses INSERT OR IGNORE to avoid duplicates on re-import.
        """
        conn = self._get_conn()
        try:
            conn.executemany(
                "INSERT OR IGNORE INTO pending_review (financial_id) VALUES (?)",
                [(fid,) for fid in financial_ids],
            )
            conn.commit()
        finally:
            conn.close()

    def get_unnotified_pending_reviews(self, min_age_hours: int = 48) -> list[dict]:
        """Return pending reviews older than min_age_hours that haven't been notified yet."""
        conn = self._get_conn()
        try:
            rows = conn.execute("""
                SELECT * FROM pending_review
                WHERE notified_at IS NULL
                  AND imported_at <= datetime('now', ?)
                ORDER BY imported_at
            """, (f"-{min_age_hours} hours",)).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def mark_pending_reviews_notified(self, financial_ids: list[str]):
        conn = self._get_conn()
        try:
            conn.executemany(
                "UPDATE pending_review SET notified_at = datetime('now') WHERE financial_id = ?",
                [(fid,) for fid in financial_ids],
            )
            conn.commit()
        finally:
            conn.close()

    def cleanup_old_pending_reviews(self, older_than_days: int = 30):
        """Remove notified reviews older than N days to keep the table small."""
        conn = self._get_conn()
        try:
            conn.execute("""
                DELETE FROM pending_review
                WHERE notified_at IS NOT NULL
                  AND notified_at <= datetime('now', ?)
            """, (f"-{older_than_days} days",))
            conn.commit()
        finally:
            conn.close()

    # --- Chat History ---

    def get_chat_history(self, user_id: str, limit: int = 100) -> list[dict]:
        """Return last `limit` messages for a user, oldest first."""
        conn = self._get_conn()
        try:
            rows = conn.execute("""
                SELECT role, content, ts FROM chat_history
                WHERE user_id = ?
                ORDER BY ts ASC
                LIMIT ?
            """, (user_id, limit)).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def save_chat_messages(self, user_id: str, messages: list[dict]) -> int:
        """Insert chat messages and trim to last 500. Returns number saved."""
        conn = self._get_conn()
        try:
            import time
            now_ms = int(time.time() * 1000)
            for msg in messages:
                conn.execute(
                    "INSERT INTO chat_history (user_id, role, content, ts) VALUES (?, ?, ?, ?)",
                    (user_id, msg["role"], msg["content"], now_ms)
                )
            # Trim beyond last 500 for this user
            conn.execute("""
                DELETE FROM chat_history
                WHERE user_id = ? AND id NOT IN (
                    SELECT id FROM chat_history WHERE user_id = ? ORDER BY ts DESC LIMIT 500
                )
            """, (user_id, user_id))
            conn.commit()
            return len(messages)
        finally:
            conn.close()

    def clear_chat_history(self, user_id: str) -> None:
        """Delete all chat messages for a user."""
        conn = self._get_conn()
        try:
            conn.execute("DELETE FROM chat_history WHERE user_id = ?", (user_id,))
            conn.commit()
        finally:
            conn.close()
