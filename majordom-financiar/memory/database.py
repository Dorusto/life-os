from __future__ import annotations
"""
Baza de date locală (SQLite) pentru memoria majordomului.

Stochează:
- Istoricul tranzacțiilor procesate
- Asocierile merchant → categorie (pentru învățare)
- Feedbackul utilizatorului
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
    """O tranzacție procesată și stocată."""
    id: int | None = None
    merchant: str = ""
    amount: float = 0.0
    category_id: str = ""
    date: str = ""
    raw_ocr_text: str = ""
    confidence: float = 0.0
    user_confirmed: bool = False
    created_at: str = ""
    actual_budget_id: str = ""  # ID-ul din Actual Budget


@dataclass
class MerchantMapping:
    """Asociere merchant → categorie învățată."""
    merchant: str
    category_id: str
    times_seen: int = 1
    last_seen: str = ""


class MemoryDB:
    """Interfață SQLite pentru memoria majordomului."""

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
        """Creează tabelele dacă nu există."""
        conn = self._get_conn()
        try:
            conn.executescript("""
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
            """)
            conn.commit()
            logger.info(f"Baza de date inițializată: {self.db_path}")
        finally:
            conn.close()

    # --- Tranzacții ---

    def save_transaction(self, record: TransactionRecord) -> int:
        """Salvează o tranzacție și returnează ID-ul."""
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
            logger.info(f"Tranzacție salvată #{tx_id}: {record.merchant} {record.amount}")
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
        """Listează tranzacții cu filtre opționale."""
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
        """Statistici agregate pe lună."""
        if not month or not year:
            now = datetime.now()
            month = month or now.month
            year = year or now.year

        conn = self._get_conn()
        try:
            date_prefix = f"{year}-{month:02d}"

            # Total pe categorii
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

            # Total general
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

    # --- Merchant Mappings (pentru învățare) ---

    def get_merchant_category(self, merchant: str) -> MerchantMapping | None:
        """Caută categoria asociată unui merchant."""
        conn = self._get_conn()
        try:
            # Căutare exactă
            row = conn.execute(
                "SELECT * FROM merchant_mappings WHERE merchant = ?",
                (merchant.lower(),)
            ).fetchone()

            if row:
                return MerchantMapping(**dict(row))

            # Căutare fuzzy (conține)
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
        """Salvează/actualizează asocierea merchant → categorie."""
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
            logger.info(f"Mapping salvat: '{merchant}' → '{category_id}'")
        finally:
            conn.close()

    def update_transaction_category(self, tx_id: int, category_id: str):
        """Actualizează categoria unei tranzacții (după feedback user)."""
        conn = self._get_conn()
        try:
            conn.execute("""
                UPDATE transactions
                SET category_id = ?, user_confirmed = 1
                WHERE id = ?
            """, (category_id, tx_id))
            conn.commit()
            logger.info(f"Tranzacție #{tx_id} actualizată → '{category_id}'")
        finally:
            conn.close()

    # --- Keywords ---

    def add_keyword(self, keyword: str, category_id: str, weight: float = 1.0):
        """Adaugă un cuvânt cheie pentru o categorie."""
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
        """Returnează toate keyword-urile grupate pe categorie."""
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
        """Setează limita lunară pentru o categorie."""
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
        """Returnează toate limitele lunare {category_name: limit}."""
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT category_name, monthly_limit FROM budget_limits"
            ).fetchall()
            return {row["category_name"]: row["monthly_limit"] for row in rows}
        finally:
            conn.close()

    def get_budget_limit(self, category_name: str) -> float | None:
        """Returnează limita pentru o categorie specifică."""
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT monthly_limit FROM budget_limits WHERE category_name = ?",
                (category_name,)
            ).fetchone()
            return row["monthly_limit"] if row else None
        finally:
            conn.close()
