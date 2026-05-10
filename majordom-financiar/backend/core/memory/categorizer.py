from __future__ import annotations
"""
Smart categorizer with learning from feedback.

Uses a simple but effective system:
1. Exact merchant match (from history)
2. Keyword matching (from config + learned)

No heavy ML — a rule-based + frequency system
works great for our use case and is 100% transparent.
"""
import json
import re
from pathlib import Path
from dataclasses import dataclass
from collections import Counter
import logging

from .database import MemoryDB

logger = logging.getLogger(__name__)


@dataclass
class CategoryPrediction:
    """Category prediction with confidence."""
    category_id: str
    category_name: str
    confidence: float  # 0.0 - 1.0
    reason: str  # Explanation shown to the user
    from_history: bool = False  # True only if from user-confirmed merchant_mappings

    @property
    def emoji(self) -> str:
        return CATEGORY_EMOJIS.get(self.category_id, "📦")


# Category → emoji mapping
CATEGORY_EMOJIS = {
    "groceries": "🛒", "restaurants": "🍽️", "transport": "🚗",
    "utilities": "💡", "health": "💊", "clothing": "👕",
    "home": "🏠", "entertainment": "🎬", "education": "📚",
    "other": "📦"
}


class SmartCategorizer:
    """
    Categorizer that learns from user feedback.

    Categorization levels (in priority order):
    1. HISTORY — exact merchant seen before → confidence 95%
    2. KEYWORDS — matching keywords → confidence 70-90%
    3. FALLBACK → "other" with confidence 0%
    """

    def __init__(self, db: MemoryDB, categories_path: str | None = None):
        self.db = db
        self.categories = self._load_categories(categories_path)
        self._keyword_index: dict[str, str] = {}
        self._rebuild_keyword_index()

    def _load_categories(self, path: str | None) -> dict:
        """Load categories from JSON."""
        if path is None:
            path = str(
                Path(__file__).parent.parent / "config" / "categories.json"
            )

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {
                    cat["id"]: cat for cat in data.get("categories", [])
                }
        except FileNotFoundError:
            logger.warning(f"Categories file not found: {path}")
            return {"other": {"id": "other", "name": "Other", "keywords": []}}

    def _rebuild_keyword_index(self):
        """Rebuild the keyword index."""
        self._keyword_index = {}

        # From config (predefined categories)
        for cat_id, cat_data in self.categories.items():
            for keyword in cat_data.get("keywords", []):
                self._keyword_index[keyword.lower()] = cat_id

        # From database (learned from user)
        db_keywords = self.db.get_all_keywords()
        for cat_id, keywords in db_keywords.items():
            for keyword, weight in keywords:
                if weight >= 0.5:  # Minimum threshold
                    self._keyword_index[keyword.lower()] = cat_id

        logger.debug(f"Keyword index: {len(self._keyword_index)} entries")

    def predict(
        self, merchant: str, ocr_text: str = "", amount: float = 0.0
    ) -> CategoryPrediction:
        """
        Predict the category for a transaction.

        Args:
            merchant: The store/merchant name
            ocr_text: Full OCR text (optional, improves accuracy)
            amount: Transaction amount (optional, may help discrimination)

        Returns:
            CategoryPrediction with category and confidence
        """
        merchant_lower = merchant.lower().strip()
        text_lower = ocr_text.lower() if ocr_text else merchant_lower

        # --- Level 1: Exact history (user-confirmed) ---
        mapping = self.db.get_merchant_category(merchant_lower)
        if mapping and mapping.times_seen >= 1:
            # Confidence increases with number of confirmations
            conf = min(0.95, 0.70 + mapping.times_seen * 0.05)
            cat = self.categories.get(mapping.category_id, {})
            return CategoryPrediction(
                category_id=mapping.category_id,
                category_name=cat.get("name", mapping.category_id),
                confidence=conf,
                reason=f"Known merchant (seen {mapping.times_seen}x)",
                from_history=True,
            )

        # --- Level 2: Keywords ---
        keyword_match = self._match_keywords(text_lower)
        if keyword_match:
            cat_id, matched_keyword = keyword_match
            cat = self.categories.get(cat_id, {})
            return CategoryPrediction(
                category_id=cat_id,
                category_name=cat.get("name", cat_id),
                confidence=0.75,
                reason=f"Keyword: '{matched_keyword}'"
            )

        # --- Fallback ---
        return CategoryPrediction(
            category_id="other",
            category_name="Other",
            confidence=0.0,
            reason="Unknown category — please confirm"
        )

    def _match_keywords(self, text: str) -> tuple[str, str] | None:
        """Search for keywords in text."""
        # Sort descending by length (longer matches = more specific)
        sorted_keywords = sorted(
            self._keyword_index.keys(), key=len, reverse=True
        )

        for keyword in sorted_keywords:
            if keyword in text:
                return self._keyword_index[keyword], keyword

        return None

    def _tokenize(self, text: str) -> list[str]:
        """Simple tokenization — words with at least 3 characters."""
        words = re.findall(r"[a-zăâîșț]{3,}", text.lower())
        # Remove common Romanian stop words
        stop_words = {
            "din", "pentru", "care", "sau", "este", "sunt",
            "lei", "ron", "buc", "total", "noi", "mai",
        }
        return [w for w in words if w not in stop_words]

    def learn(self, merchant: str, category_id: str, ocr_text: str = ""):
        """
        Learn from user feedback.

        Args:
            merchant: The store/merchant name
            category_id: The confirmed category
            ocr_text: Full OCR text (for keyword extraction)
        """
        # Save the merchant → category mapping
        self.db.save_merchant_mapping(merchant, category_id)

        # Extract and save new keywords from OCR text
        if ocr_text:
            tokens = self._tokenize(ocr_text)
            # Top 5 most frequent words (potential useful keywords)
            token_counts = Counter(tokens)
            for word, count in token_counts.most_common(5):
                if count >= 2 and len(word) >= 4:
                    self.db.add_keyword(word, category_id, weight=0.5)

        # Rebuild the index
        self._rebuild_keyword_index()

        logger.info(f"Learned: '{merchant}' → '{category_id}'")

    def get_all_categories(self) -> list[dict]:
        """Return the full list of categories."""
        return [
            {
                "id": cat_id,
                "name": cat_data.get("name", cat_id),
                "emoji": cat_data.get("emoji", "📦")
            }
            for cat_id, cat_data in self.categories.items()
        ]
