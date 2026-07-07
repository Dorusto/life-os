from __future__ import annotations

"""
Vision-based extraction engine using an AI vision model.

Replaces the classic Tesseract + OpenCV + regex pipeline with a single
call to a multimodal model. Sends the image directly, receives
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

from backend.core.config import build_llm_headers
from backend.core.ocr.parser import ReceiptData, ReceiptItem

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """You are a receipt data extraction system. Analyze the receipt image and return JSON.

Return ONLY valid JSON, no markdown, no extra text.

Required format:
{
  "receipt_type": "fuel",
  "merchant": "Shell Alphen aan den Rijn",
  "total": 71.24,
  "currency": "EUR",
  "date": "25.05.2026",
  "liters": 30.07,
  "price_per_liter": 2.369,
  "fuel_grade": "95+"
}

OR for non-fuel receipts:
{
  "receipt_type": "grocery",
  "merchant": "Albert Heijn",
  "total": 24.50,
  "currency": "EUR",
  "date": "25.05.2026",
  "liters": null,
  "price_per_liter": null,
  "fuel_grade": null
}

Rules:
- "receipt_type": "fuel" for gas stations (brandstof/benzine/diesel/petrol), "grocery" for everything else
- "merchant": full station name including city if visible (e.g. "Shell Alphen aan den Rijn", "Total Oostzaan")
- "total": total amount paid (look for TOTAAL, TOTAL, BEDRAG)
- "currency": "EUR" default
- "date": read every date on the receipt; use the transaction date (often at the bottom like "30-04-2026 12:16:14"). Return in DD.MM.YYYY format, empty string if not found
- "liters": liters dispensed. On Dutch receipts liters often appear in parentheses like "(POMP 4; 31.37 L * €2.349/L)" — extract 31.37. Look for L, ltr, litre, liter anywhere on the receipt. null if not fuel
- "price_per_liter": price per liter (look for €/L, prijs/liter, the number after * €). null if not fuel
- "fuel_grade": fuel type string as shown (e.g. "95+", "Euro 95", "E10", "Diesel", "Euro 95 F10"). null if not fuel
- Use null for any value you cannot find with certainty
"""


class VisionEngine:
    """Extract data from receipts using an AI vision model."""

    def __init__(self, llm_url: str, model: str, api_key: str = ""):
        self.llm_url = llm_url.rstrip("/")
        self.model = model
        self.api_key = api_key

    async def extract_from_path(self, image_path: str | Path) -> ReceiptData:
        """Extract data from an image file."""
        image_bytes = Path(image_path).read_bytes()
        return await self.extract_from_bytes(image_bytes)

    async def extract_from_bytes(self, image_bytes: bytes) -> ReceiptData:
        """Extract data directly from bytes."""
        resized = self._resize_image(image_bytes)
        b64_image = base64.b64encode(resized).decode("utf-8")
        return await self._call_llm(b64_image)

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

    async def _call_llm(self, b64_image: str) -> ReceiptData:
        """Call the LLM API and parse the response."""
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": EXTRACT_PROMPT},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}},
                    ],
                }
            ],
            "stream": False,
            "options": {
                "temperature": 0.0,
                "num_predict": 512,
                "num_ctx": 8192,
            },
        }

        logger.info(f"Sending image to LLM ({self.model})...")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.llm_url}/v1/chat/completions",
                    json=payload,
                    headers=build_llm_headers(self.api_key),
                    timeout=aiohttp.ClientTimeout(total=300),
                ) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        raise Exception(f"LLM error {resp.status}: {text[:200]}")
                    data = await resp.json()

            # OpenAI format: choices[0].message.content
            raw_content = data["choices"][0]["message"]["content"].strip()
            logger.debug(f"LLM response:\n{raw_content}")

            return self._parse_response(raw_content)

        except aiohttp.ClientConnectorError:
            raise Exception(
                f"Cannot connect to LLM ({self.llm_url}). "
                "Make sure the provider is running."
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

        # Fuel receipt fields
        receipt.receipt_type = data.get("receipt_type") or "grocery"
        liters = data.get("liters")
        if liters is not None:
            try:
                receipt.liters = float(liters)
            except (ValueError, TypeError):
                receipt.liters = None
        price_per_liter = data.get("price_per_liter")
        if price_per_liter is not None:
            try:
                receipt.price_per_liter = float(price_per_liter)
            except (ValueError, TypeError):
                receipt.price_per_liter = None
        receipt.fuel_grade = data.get("fuel_grade")

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
        """Check if LLM provider is reachable and the model is available.

        Tries OpenAI-compatible /v1/models first (works with OpenRouter,
        DeepSeek, etc.), then falls back to Ollama-specific /api/tags.
        """
        try:
            async with aiohttp.ClientSession() as session:
                # Try OpenAI-compatible endpoint first
                async with session.get(
                    f"{self.llm_url}/v1/models",
                    headers=build_llm_headers(self.api_key),
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        return True  # cloud APIs are reachable
        except Exception:
            pass

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.llm_url}/api/tags",
                    headers=build_llm_headers(self.api_key),
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

