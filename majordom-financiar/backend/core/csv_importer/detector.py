from __future__ import annotations
"""
Detecție automată a structurii CSV cu Ollama.

Flux:
1. Calculează header_signature (MD5 pe coloanele sortate)
2. Caută în SQLite profilul salvat anterior (detecție instant)
3. Dacă nu există → trimite headere + 3 rânduri la Ollama text model
4. Ollama returnează JSON cu mapping-ul coloanelor
5. Utilizatorul confirmă → profilul e salvat pentru data viitoare
"""
import hashlib
import json
import logging
import re

import aiohttp

from .profiles import CsvProfile

logger = logging.getLogger(__name__)

_DETECT_PROMPT = """\
You are a CSV bank/financial export analyzer. Given the column headers and \
first 3 rows, identify the structure and return a JSON mapping.

Return ONLY a valid JSON object — no markdown, no extra text.

Required fields:
{{
  "source_name": "bank or service name (ING, Revolut, crypto.com, Bunq, etc.)",
  "col_date": "exact column header containing transaction date",
  "col_merchant": "exact column header for payee/store/merchant name",
  "col_amount": "exact column header for transaction amount",
  "col_currency": "exact column header for currency code, or empty string if absent",
  "col_direction": "exact column header for debit/credit direction, or empty string if amount already has +/- sign",
  "col_description": "exact column header for memo/notes, or empty string if absent",
  "expense_indicator": "value in direction column that means expense (e.g. Af, Debit, OUT, -), or empty string",
  "date_format": "Python strptime format string (e.g. %d-%m-%Y or %Y-%m-%d %H:%M:%S)",
  "decimal_sep": "decimal separator used in amount values: dot or comma",
  "confidence": 0.9
}}

HEADERS: {headers}

FIRST 3 ROWS:
{rows}
"""


class CsvProfileDetector:

    def __init__(self, ollama_url: str, ollama_model: str):
        self.ollama_url = ollama_url.rstrip("/")
        self.ollama_model = ollama_model

    def header_signature(self, headers: list[str]) -> str:
        """MD5 pe headerele sortate și lowercased — fingerprint stabil al formatului."""
        normalized = ",".join(sorted(h.strip().lower() for h in headers))
        return hashlib.md5(normalized.encode()).hexdigest()[:12]

    async def detect_with_ollama(
        self,
        headers: list[str],
        sample_rows: list[dict],
        delimiter: str,
    ) -> CsvProfile | None:
        """
        Detectează structura CSV trimițând headerele și 3 rânduri la Ollama.
        Returnează un CsvProfile propus (neconfirmat) sau None dacă eșuează.
        """
        headers_str = str(headers)
        rows_str = "\n".join(
            f"Row {i + 1}: " + ", ".join(f"{k}={v!r}" for k, v in row.items())
            for i, row in enumerate(sample_rows[:3])
        )

        prompt = _DETECT_PROMPT.format(headers=headers_str, rows=rows_str)

        payload = {
            "model": self.ollama_model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {"temperature": 0.0, "num_predict": 400},
        }

        logger.info(f"Trimit CSV la Ollama pentru detecție ({self.ollama_model})...")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/chat",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=90),
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.error(f"Ollama error {resp.status}: {body[:200]}")
                        return None
                    data = await resp.json()

            content = data["message"]["content"].strip()
            logger.debug(f"Răspuns Ollama detecție CSV:\n{content}")

            parsed = json.loads(self._extract_json(content))

            sig = self.header_signature(headers)
            decimal_raw = parsed.get("decimal_sep", ".")
            decimal_sep = "," if "comma" in str(decimal_raw).lower() or decimal_raw == "," else "."

            return CsvProfile(
                source_name=parsed.get("source_name") or "Necunoscut",
                header_sig=sig,
                col_date=parsed.get("col_date") or "",
                col_merchant=parsed.get("col_merchant") or "",
                col_amount=parsed.get("col_amount") or "",
                col_currency=parsed.get("col_currency") or "",
                col_direction=parsed.get("col_direction") or "",
                col_description=parsed.get("col_description") or "",
                expense_indicator=parsed.get("expense_indicator") or "",
                date_format=parsed.get("date_format") or "%Y-%m-%d",
                delimiter=delimiter,
                decimal_sep=decimal_sep,
                confirmed=False,
            )

        except json.JSONDecodeError as e:
            logger.error(f"JSON invalid de la Ollama: {e}")
            return None
        except Exception as e:
            logger.error(f"Eroare detecție Ollama: {e}", exc_info=True)
            return None

    def _extract_json(self, text: str) -> str:
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            return match.group(1)
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return match.group(0)
        return text
