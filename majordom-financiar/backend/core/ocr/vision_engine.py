from __future__ import annotations

"""
Motor de extracție bazat pe model AI vision (Ollama).

Înlocuiește pipeline-ul clasic Tesseract + OpenCV + regex cu un singur
apel la un model multimodal local. Trimite poza direct, primește JSON
structurat cu datele bonului.

Model recomandat: qwen2.5vl:7b (~5GB VRAM, excelent pentru documente)
"""
import base64
import io
import json
import logging
import re
from datetime import date
from pathlib import Path

import aiohttp
from PIL import Image

from ocr.parser import ReceiptData, ReceiptItem

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """You are a receipt data extraction system. Analyze the receipt image and extract information as JSON.

Return ONLY a valid JSON object, no extra text, no markdown, no ```json.

Required format:
{
  "merchant": "store or company name",
  "total": 0.00,
  "currency": "EUR",
  "date": "DD.MM.YYYY",
  "items": [
    {"name": "product name", "quantity": 1.0, "unit_price": 0.00, "total_price": 0.00}
  ],
  "cui": "tax/fiscal code if present, else empty string"
}

Rules:
- "merchant": main store name (e.g. "Albert Heijn", "Jumbo", "Lidl", "Kaufland")
- "total": the final amount paid, as a decimal number (e.g. 12.45)
- "currency": detect from receipt symbols or context — use "EUR" for €, "RON" for lei/RON, "GBP" for £, etc. Default to "EUR" if unclear.
- "date": receipt date in DD.MM.YYYY format, empty string if not found
- "items": list of products if visible, otherwise empty list []
- "cui": fiscal/registration code if present on receipt, otherwise ""
- If you cannot identify a value with certainty, use null for numbers or "" for text
"""


class VisionEngine:
    """Extrage date din bonuri folosind un model AI vision local (Ollama)."""

    def __init__(self, ollama_url: str, model: str):
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model

    async def extract_from_path(self, image_path: str | Path) -> ReceiptData:
        """Extrage date dintr-un fișier imagine."""
        image_bytes = Path(image_path).read_bytes()
        return await self.extract_from_bytes(image_bytes)

    async def extract_from_bytes(self, image_bytes: bytes) -> ReceiptData:
        """Extrage date direct din bytes (de la Telegram)."""
        resized = self._resize_image(image_bytes)
        b64_image = base64.b64encode(resized).decode("utf-8")
        return await self._call_ollama(b64_image)

    def _resize_image(self, image_bytes: bytes, max_size: int = 512) -> bytes:
        """
        Redimensionează imaginea la max 512px pe latura lungă.
        512px → ~1300 tokeni vizuali (față de ~5300 la 1024px).
        Încape în 8GB VRAM cu tot modelul pe GPU.
        """
        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size

        if max(w, h) > max_size:
            scale = max_size / max(w, h)
            new_w, new_h = int(w * scale), int(h * scale)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            logger.debug(f"Imagine redimensionată: {w}x{h} → {new_w}x{new_h}")

        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=90)
        return buf.getvalue()

    async def _call_ollama(self, b64_image: str) -> ReceiptData:
        """Apelează Ollama API și parsează răspunsul."""
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": EXTRACT_PROMPT,
                    "images": [b64_image],
                }
            ],
            "stream": False,
            "options": {
                "temperature": 0.0,
                "num_predict": 512,
                "num_ctx": 1024,
            },
        }

        logger.info(f"Trimit imaginea la Ollama ({self.model})...")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/chat",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=120),
                ) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        raise Exception(f"Ollama error {resp.status}: {text[:200]}")
                    data = await resp.json()

            raw_content = data["message"]["content"].strip()
            logger.debug(f"Răspuns Ollama:\n{raw_content}")

            return self._parse_response(raw_content)

        except aiohttp.ClientConnectorError:
            raise Exception(
                f"Nu mă pot conecta la Ollama ({self.ollama_url}). "
                "Asigură-te că Ollama rulează pe host."
            )

    def _parse_response(self, content: str) -> ReceiptData:
        """Parsează răspunsul JSON de la model."""
        # Extrage JSON din răspuns (modelul uneori adaugă text în jur)
        json_str = self._extract_json(content)

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON invalid de la model: {e}\nConținut: {content[:500]}")
            return ReceiptData(raw_text=content)

        # Construiește ReceiptData din JSON
        receipt = ReceiptData(raw_text=content)

        receipt.merchant = data.get("merchant") or "Necunoscut"
        receipt.currency = (data.get("currency") or "EUR").upper()
        receipt.cui = data.get("cui") or ""

        # Total
        total = data.get("total")
        if total is not None:
            try:
                receipt.total = float(total)
            except (ValueError, TypeError):
                receipt.total = 0.0

        # Data
        date_str = data.get("date") or ""
        receipt.date = self._parse_date(date_str)

        # Articole
        items_raw = data.get("items") or []
        receipt.items = []
        for item in items_raw:
            if not isinstance(item, dict):
                continue
            try:
                receipt.items.append(ReceiptItem(
                    name=str(item.get("name") or ""),
                    quantity=float(item.get("quantity") or 1.0),
                    unit_price=float(item.get("unit_price") or 0.0),
                    total_price=float(item.get("total_price") or 0.0),
                ))
            except (ValueError, TypeError):
                continue

        if receipt.is_valid:
            logger.info(
                f"Bon extras cu AI: {receipt.merchant}, {receipt.total} RON, "
                f"{len(receipt.items)} articole"
            )
        else:
            logger.warning(
                f"Bon incomplet: merchant='{receipt.merchant}', total={receipt.total}"
            )

        return receipt

    def _extract_json(self, text: str) -> str:
        """Extrage blocul JSON din textul răspunsului."""
        # Caută ```json ... ``` sau ``` ... ```
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            return match.group(1)

        # Caută { ... } direct
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return match.group(0)

        return text

    def _parse_date(self, date_str: str) -> date | None:
        """Parsează data din format DD.MM.YYYY."""
        if not date_str:
            return date.today()

        for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
            try:
                from datetime import datetime
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue

        return date.today()

    async def is_available(self) -> bool:
        """Verifică dacă Ollama e disponibil și modelul e instalat."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.ollama_url}/api/tags",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status != 200:
                        return False
                    data = await resp.json()
                    models = [m["name"] for m in data.get("models", [])]
                    # Verifică potrivire parțială (qwen2.5vl:7b vs qwen2.5vl:7b-instruct)
                    return any(self.model.split(":")[0] in m for m in models)
        except Exception:
            return False
