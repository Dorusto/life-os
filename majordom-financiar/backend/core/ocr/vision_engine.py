from __future__ import annotations

"""
Vision-based extraction engine using an AI vision model (Ollama).

Replaces the classic Tesseract + OpenCV + regex pipeline with a single
call to a local multimodal model. Sends the image directly, receives
structured JSON with receipt data.

Recommended model: qwen2.5vl:7b (~5GB VRAM, excellent for documents)
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

from backend.core.ocr.parser import ReceiptData, ReceiptItem

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """You are a receipt data extraction system. Analyze the receipt image and extract information as JSON.

Return ONLY a valid JSON object, no extra text, no markdown, no ```json.

Required format:
{
  "merchant": "store or company name",
  "total": 0.00,
  "currency": "EUR",
  "date": "DD.MM.YYYY"
}

Rules:
- "merchant": main store name (e.g. "Albert Heijn", "Jumbo", "Lidl", "Kaufland")
- "total": the final amount paid, as a decimal number (e.g. 12.45)
- "currency": detect from receipt symbols or context — use "EUR" for €, "RON" for lei/RON, "GBP" for £, etc. Default to "EUR" if unclear.
- "date": receipt date in DD.MM.YYYY format, empty string if not found
- If you cannot identify a value with certainty, use null for numbers or "" for text
"""


class VisionEngine:
    """Extract data from receipts using a local AI vision model (Ollama)."""

    def __init__(self, ollama_url: str, model: str):
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model

    async def extract_from_path(self, image_path: str | Path) -> ReceiptData:
        """Extract data from an image file."""
        image_bytes = Path(image_path).read_bytes()
        return await self.extract_from_bytes(image_bytes)

    async def extract_from_bytes(self, image_bytes: bytes) -> ReceiptData:
        """Extract data directly from bytes (from Telegram)."""
        resized = self._resize_image(image_bytes)
        b64_image = base64.b64encode(resized).decode("utf-8")
        return await self._call_ollama(b64_image)

    def _resize_image(self, image_bytes: bytes, max_size: int = 1000) -> bytes:
        """
        Resize image to max 1000px on the long side.
        1000px → ~4000 vision tokens — better OCR accuracy on small receipts,
        acceptable speed (~60-90s on CPU). Previously 512px (faster but less accurate).
        """
        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size

        if max(w, h) > max_size:
            scale = max_size / max(w, h)
            new_w, new_h = int(w * scale), int(h * scale)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            logger.debug(f"Image resized: {w}x{h} → {new_w}x{new_h}")

        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=90)
        return buf.getvalue()

    async def _call_ollama(self, b64_image: str) -> ReceiptData:
        """Call the Ollama API and parse the response."""
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
                "num_ctx": 8192,
            },
        }

        logger.info(f"Sending image to Ollama ({self.model})...")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/chat",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=300),
                ) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        raise Exception(f"Ollama error {resp.status}: {text[:200]}")
                    data = await resp.json()

            raw_content = data["message"]["content"].strip()
            logger.debug(f"Ollama response:\n{raw_content}")

            return self._parse_response(raw_content)

        except aiohttp.ClientConnectorError:
            raise Exception(
                f"Cannot connect to Ollama ({self.ollama_url}). "
                "Make sure Ollama is running on the host."
            )

    def _parse_response(self, content: str) -> ReceiptData:
        """Parse the JSON response from the model."""
        # Extract JSON from response (the model sometimes adds surrounding text)
        json_str = self._extract_json(content)

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid JSON from model: {e}\nContent: {content[:500]}")
            return ReceiptData(raw_text=content)

        # Build ReceiptData from JSON
        receipt = ReceiptData(raw_text=content)

        receipt.merchant = data.get("merchant") or "Unknown"
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

        # Items
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
                f"Receipt extracted with AI: {receipt.merchant}, {receipt.total} EUR, "
                f"{len(receipt.items)} items"
            )
        else:
            logger.warning(
                f"Incomplete receipt: merchant='{receipt.merchant}', total={receipt.total}"
            )

        return receipt

    def _extract_json(self, text: str) -> str:
        """Extract the JSON block from the response text."""
        # Look for ```json ... ``` or ``` ... ```
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            return match.group(1)

        # Look for { ... } directly
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return match.group(0)

        return text

    def _parse_date(self, date_str: str) -> date | None:
        """Parse date from DD.MM.YYYY format."""
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
        """Check if Ollama is available and the model is installed."""
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
                    # Check partial match (qwen2.5vl:7b vs qwen2.5vl:7b-instruct)
                    return any(self.model.split(":")[0] in m for m in models)
        except Exception:
            return False
