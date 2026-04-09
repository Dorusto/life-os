from __future__ import annotations
"""
Motor OCR bazat pe Tesseract.

De ce Tesseract și nu altceva?
- 100% local, fără cloud
- Suport nativ pentru limba română
- Gratuit, open-source, matur (Google-backed)
- Suficient de precis pentru bonuri pre-procesate
"""
import pytesseract
import numpy as np
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class OCRResult:
    """Rezultatul OCR pentru o imagine."""
    raw_text: str
    confidence: float
    lines: list[str]

    @property
    def clean_text(self) -> str:
        """Text curățat de linii goale și spații excesive."""
        return "\n".join(line for line in self.lines if line.strip())


class OCREngine:
    """Wrapper Tesseract optimizat pentru bonuri românești."""

    def __init__(self, lang: str = "ron+eng"):
        """
        Args:
            lang: Limbile OCR. "ron+eng" = română + engleză
                  (eng ajută la branduri internaționale)
        """
        self.lang = lang
        # Configurare Tesseract optimizată pentru bonuri
        # --psm 4 = presupune o singură coloană de text (ca un bon)
        # --oem 3 = motorul LSTM (cel mai precis)
        self.custom_config = r"--oem 3 --psm 4"

    def extract_text(self, image: np.ndarray) -> OCRResult:
        """
        Extrage text dintr-o imagine pre-procesată.

        Args:
            image: Imagine numpy array (grayscale, pre-procesată)

        Returns:
            OCRResult cu textul extras și confidența
        """
        logger.info("Rulează OCR Tesseract...")

        # Extrage text cu informații detaliate
        data = pytesseract.image_to_data(
            image, lang=self.lang, config=self.custom_config,
            output_type=pytesseract.Output.DICT
        )

        # Calculează confidența medie (ignoră elementele fără text)
        confidences = [
            int(c) for c, t in zip(data["conf"], data["text"])
            if int(c) > 0 and t.strip()
        ]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

        # Extrage textul simplu
        raw_text = pytesseract.image_to_string(
            image, lang=self.lang, config=self.custom_config
        )

        lines = raw_text.split("\n")

        result = OCRResult(
            raw_text=raw_text,
            confidence=avg_confidence,
            lines=lines
        )

        logger.info(
            f"OCR completat: {len(result.lines)} linii, "
            f"confidență {avg_confidence:.1f}%"
        )
        logger.debug(f"Text extras:\n{result.clean_text[:500]}")

        return result

    def extract_text_simple(self, image: np.ndarray) -> str:
        """Versiune simplificată — returnează doar textul."""
        return self.extract_text(image).clean_text

    @staticmethod
    def is_available() -> bool:
        """Verifică dacă Tesseract e instalat."""
        try:
            pytesseract.get_tesseract_version()
            return True
        except pytesseract.TesseractNotFoundError:
            return False

    @staticmethod
    def available_languages() -> list[str]:
        """Listează limbile disponibile."""
        try:
            return pytesseract.get_languages()
        except Exception:
            return []
