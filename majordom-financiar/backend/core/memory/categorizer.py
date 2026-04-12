from __future__ import annotations
"""
Motor de categorizare inteligent cu învățare din feedback.

Folosește un sistem simplu dar eficient:
1. Potrivire exactă pe merchant (din istoric)
2. Potrivire pe cuvinte cheie (din config + învățate)
3. TF-IDF simplificat pe textul OCR complet

Nu folosim ML greu — un sistem bazat pe reguli + frecvențe
funcționează excelent pentru cazul nostru și e 100% transparent.
"""
import json
import math
import re
from pathlib import Path
from dataclasses import dataclass
from collections import Counter
import logging

from .database import MemoryDB

logger = logging.getLogger(__name__)


@dataclass
class CategoryPrediction:
    """Predicție de categorie cu confidență."""
    category_id: str
    category_name: str
    confidence: float  # 0.0 - 1.0
    reason: str  # Explicație pentru utilizator
    from_history: bool = False  # True doar dacă vine din merchant_mappings confirmat de user

    @property
    def emoji(self) -> str:
        return CATEGORY_EMOJIS.get(self.category_id, "📦")


# Mapare categorii → emoji
CATEGORY_EMOJIS = {
    "groceries": "🛒", "restaurants": "🍽️", "transport": "🚗",
    "utilities": "💡", "health": "💊", "clothing": "👕",
    "home": "🏠", "entertainment": "🎬", "education": "📚",
    "other": "📦"
}


class SmartCategorizer:
    """
    Categorizator care învață din feedback-ul utilizatorului.

    Niveluri de categorizare (în ordine de prioritate):
    1. HISTORY — merchant exact văzut anterior → confidență 95%
    2. KEYWORDS — cuvinte cheie potrivite → confidență 70-90%
    3. TFIDF — similaritate text cu tranzacții anterioare → confidență 50-80%
    4. FALLBACK → "other" cu confidență 0%
    """

    def __init__(self, db: MemoryDB, categories_path: str | None = None):
        self.db = db
        self.categories = self._load_categories(categories_path)
        self._keyword_index: dict[str, str] = {}
        self._rebuild_keyword_index()

    def _load_categories(self, path: str | None) -> dict:
        """Încarcă categoriile din JSON."""
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
            logger.warning(f"Fișier categorii negăsit: {path}")
            return {"other": {"id": "other", "name": "Altele", "keywords": []}}

    def _rebuild_keyword_index(self):
        """Reconstruiește indexul de cuvinte cheie."""
        self._keyword_index = {}

        # Din config (categorii predefinite)
        for cat_id, cat_data in self.categories.items():
            for keyword in cat_data.get("keywords", []):
                self._keyword_index[keyword.lower()] = cat_id

        # Din baza de date (învățate de la user)
        db_keywords = self.db.get_all_keywords()
        for cat_id, keywords in db_keywords.items():
            for keyword, weight in keywords:
                if weight >= 0.5:  # Prag minim
                    self._keyword_index[keyword.lower()] = cat_id

        logger.debug(f"Index keywords: {len(self._keyword_index)} intrări")

    def predict(
        self, merchant: str, ocr_text: str = "", amount: float = 0.0
    ) -> CategoryPrediction:
        """
        Prezice categoria pentru o tranzacție.

        Args:
            merchant: Numele magazinului
            ocr_text: Textul OCR complet (opțional, îmbunătățește acuratețea)
            amount: Suma (opțional, poate ajuta la discriminare)

        Returns:
            CategoryPrediction cu categoria și confidența
        """
        merchant_lower = merchant.lower().strip()
        text_lower = ocr_text.lower() if ocr_text else merchant_lower

        # --- Nivel 1: Istoric exact (confirmat de user) ---
        mapping = self.db.get_merchant_category(merchant_lower)
        if mapping and mapping.times_seen >= 1:
            # Confidența crește cu numărul de confirmări
            conf = min(0.95, 0.70 + mapping.times_seen * 0.05)
            cat = self.categories.get(mapping.category_id, {})
            return CategoryPrediction(
                category_id=mapping.category_id,
                category_name=cat.get("name", mapping.category_id),
                confidence=conf,
                reason=f"Merchant cunoscut (văzut de {mapping.times_seen}x)",
                from_history=True,
            )

        # --- Nivel 2: Cuvinte cheie ---
        keyword_match = self._match_keywords(text_lower)
        if keyword_match:
            cat_id, matched_keyword = keyword_match
            cat = self.categories.get(cat_id, {})
            return CategoryPrediction(
                category_id=cat_id,
                category_name=cat.get("name", cat_id),
                confidence=0.75,
                reason=f"Cuvânt cheie: '{matched_keyword}'"
            )

        # --- Nivel 3: TF-IDF pe textul OCR ---
        if ocr_text:
            tfidf_match = self._tfidf_match(text_lower)
            if tfidf_match:
                cat_id, conf = tfidf_match
                cat = self.categories.get(cat_id, {})
                return CategoryPrediction(
                    category_id=cat_id,
                    category_name=cat.get("name", cat_id),
                    confidence=conf,
                    reason="Similaritate text cu tranzacții anterioare"
                )

        # --- Fallback ---
        return CategoryPrediction(
            category_id="other",
            category_name="Altele",
            confidence=0.0,
            reason="Categorie necunoscută — te rog confirmă"
        )

    def _match_keywords(self, text: str) -> tuple[str, str] | None:
        """Caută cuvinte cheie în text."""
        # Sortează descrescător după lungime (potriviri mai lungi = mai specifice)
        sorted_keywords = sorted(
            self._keyword_index.keys(), key=len, reverse=True
        )

        for keyword in sorted_keywords:
            if keyword in text:
                return self._keyword_index[keyword], keyword

        return None

    def _tfidf_match(self, text: str) -> tuple[str, float] | None:
        """
        TF-IDF simplificat.
        Compară textul curent cu texte OCR anterioare din fiecare categorie.
        """
        # Tokenizează textul curent
        current_tokens = self._tokenize(text)
        if not current_tokens:
            return None

        # Ia tranzacțiile anterioare cu text OCR
        all_transactions = self.db.get_transactions(limit=500)
        if not all_transactions:
            return None

        # Grupează pe categorii
        category_texts: dict[str, list[str]] = {}
        for tx in all_transactions:
            if tx.raw_ocr_text and tx.user_confirmed:
                if tx.category_id not in category_texts:
                    category_texts[tx.category_id] = []
                category_texts[tx.category_id].append(tx.raw_ocr_text.lower())

        if not category_texts:
            return None

        # Calculează similaritate cosinus simplificată
        best_cat = None
        best_score = 0.0
        total_docs = sum(len(texts) for texts in category_texts.values())

        for cat_id, texts in category_texts.items():
            # Construiește vocabularul categoriei
            cat_tokens = Counter()
            for t in texts:
                cat_tokens.update(self._tokenize(t))

            # Calculează scorul
            score = 0.0
            for token in current_tokens:
                if token in cat_tokens:
                    tf = cat_tokens[token] / max(sum(cat_tokens.values()), 1)
                    # IDF simplificat
                    docs_with_token = sum(
                        1 for cat_texts in category_texts.values()
                        for t in cat_texts if token in t
                    )
                    idf = math.log(total_docs / max(docs_with_token, 1))
                    score += tf * idf

            # Normalizează
            if current_tokens:
                score /= len(current_tokens)

            if score > best_score:
                best_score = score
                best_cat = cat_id

        if best_cat and best_score > 0.01:
            # Mapează scorul la confidență (0.5 - 0.8)
            confidence = min(0.8, 0.5 + best_score * 10)
            return best_cat, confidence

        return None

    def _tokenize(self, text: str) -> list[str]:
        """Tokenizare simplă — cuvinte de minim 3 caractere."""
        words = re.findall(r"[a-zăâîșț]{3,}", text.lower())
        # Elimină stop words românești comune
        stop_words = {
            "din", "pentru", "care", "sau", "este", "sunt",
            "lei", "ron", "buc", "total", "noi", "mai",
        }
        return [w for w in words if w not in stop_words]

    def learn(self, merchant: str, category_id: str, ocr_text: str = ""):
        """
        Învață din feedback-ul utilizatorului.

        Args:
            merchant: Numele magazinului
            category_id: Categoria confirmată
            ocr_text: Textul OCR complet (pentru extragere keywords)
        """
        # Salvează mapping-ul merchant → categorie
        self.db.save_merchant_mapping(merchant, category_id)

        # Extrage și salvează cuvinte cheie noi din textul OCR
        if ocr_text:
            tokens = self._tokenize(ocr_text)
            # Top 5 cuvinte cele mai frecvente (potențiale keywords utile)
            token_counts = Counter(tokens)
            for word, count in token_counts.most_common(5):
                if count >= 2 and len(word) >= 4:
                    self.db.add_keyword(word, category_id, weight=0.5)

        # Reconstruiește indexul
        self._rebuild_keyword_index()

        logger.info(f"Învățat: '{merchant}' → '{category_id}'")

    def get_all_categories(self) -> list[dict]:
        """Returnează lista completă de categorii."""
        return [
            {
                "id": cat_id,
                "name": cat_data.get("name", cat_id),
                "emoji": cat_data.get("emoji", "📦")
            }
            for cat_id, cat_data in self.categories.items()
        ]
