from __future__ import annotations
"""
Pre-procesare imagine pentru OCR.

Bonurile de cumpărături au provocări specifice:
- Hârtie termică cu contrast slab
- Fotografii la unghi, cu blur
- Iluminare neuniformă

Pipeline-ul de pre-procesare îmbunătățește dramatic acuratețea OCR.
"""
import cv2
import numpy as np
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class ImagePreprocessor:
    """Pre-procesează imagini de bonuri pentru OCR optim."""

    def __init__(self, level: int = 2):
        """
        Args:
            level: Nivel de agresivitate pre-procesare
                   1 = doar grayscale + threshold
                   2 = + denoise + deskew (recomandat)
                   3 = + morphology + adaptive threshold
        """
        self.level = level

    def process(self, image_path: str | Path) -> np.ndarray:
        """
        Pipeline complet de pre-procesare.

        Args:
            image_path: Calea către imaginea originală

        Returns:
            Imagine pre-procesată (numpy array) gata pentru OCR
        """
        img = cv2.imread(str(image_path))
        if img is None:
            raise ValueError(f"Nu pot citi imaginea: {image_path}")

        logger.info(f"Pre-procesare imagine {image_path} (nivel {self.level})")
        logger.debug(f"Dimensiune originală: {img.shape}")

        # Nivel 1: Conversii de bază
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        if self.level >= 2:
            # Denoise — elimină zgomotul păstrând marginile textului
            gray = cv2.fastNlMeansDenoising(gray, h=10)
            # Deskew — corectează înclinarea
            gray = self._deskew(gray)

        if self.level >= 3:
            # Morphology — curăță artefacte mici
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            gray = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)

        # Threshold adaptiv — funcționează bine pe bonuri cu iluminare neuniformă
        if self.level >= 3:
            processed = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 15, 11
            )
        else:
            # Otsu's threshold — bun pentru majoritate cazurilor
            _, processed = cv2.threshold(
                gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
            )

        # Resize dacă imaginea e prea mică (Tesseract merge mai bine pe 300+ DPI)
        processed = self._ensure_min_resolution(processed, min_height=1000)

        logger.debug(f"Dimensiune procesată: {processed.shape}")
        return processed

    def process_from_bytes(self, image_bytes: bytes) -> np.ndarray:
        """Pre-procesează direct din bytes (de la Telegram)."""
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Nu pot decoda imaginea din bytes")

        # Salvăm temporar și procesăm
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            cv2.imwrite(f.name, img)
            result = self.process(f.name)
            Path(f.name).unlink()  # Curățăm fișierul temporar
            return result

    def _deskew(self, image: np.ndarray) -> np.ndarray:
        """
        Corectează înclinarea imaginii.
        Detectează liniile de text și rotește imaginea.
        """
        # Detectează marginile
        edges = cv2.Canny(image, 50, 150, apertureSize=3)

        # Detectează linii cu Hough Transform
        lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180, threshold=100,
            minLineLength=100, maxLineGap=10
        )

        if lines is None:
            return image

        # Calculează unghiul median al liniilor
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            # Filtrează linii aproape orizontale (±15°)
            if abs(angle) < 15:
                angles.append(angle)

        if not angles:
            return image

        median_angle = np.median(angles)

        # Rotește imaginea
        if abs(median_angle) > 0.5:  # Doar dacă e înclinată semnificativ
            h, w = image.shape[:2]
            center = (w // 2, h // 2)
            matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)
            rotated = cv2.warpAffine(
                image, matrix, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE
            )
            logger.debug(f"Deskew: rotit cu {median_angle:.2f}°")
            return rotated

        return image

    def _ensure_min_resolution(
        self, image: np.ndarray, min_height: int = 1000
    ) -> np.ndarray:
        """Mărește imaginea dacă e prea mică pentru OCR precis."""
        h, w = image.shape[:2]
        if h < min_height:
            scale = min_height / h
            new_w = int(w * scale)
            image = cv2.resize(
                image, (new_w, min_height),
                interpolation=cv2.INTER_CUBIC
            )
            logger.debug(f"Resize: {w}x{h} → {new_w}x{min_height}")
        return image
