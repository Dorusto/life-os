# 02 — How AI Vision works (receipt OCR)

## Full flow of a receipt photo

```
JPEG photo (bytes)
    ↓
Resize to 512px (Pillow) — smaller = faster, fits in VRAM
    ↓
Encode in Base64 — converts bytes to text (to be sent in JSON)
    ↓
POST to LLM_BASE_URL/v1/chat/completions
    {
      "model": "google/gemini-2.5-flash-lite",  (or local Ollama model)
      "messages": [{"role": "user", "content": PROMPT, "images": [base64]}]
    }
    ↓
LLM processes image (instant on cloud, 30-120s on local CPU)
    ↓
JSON response:
    {"merchant": "Kaufland", "total": 45.99, "currency": "EUR", "date": "09.04.2026"}
    ↓
ReceiptData (Python dataclass with extracted fields)
```

## Why 512px and not larger?

A vision model "sees" the image as tokens. At 512px → ~1300 tokens. At 1024px → ~5300 tokens (4x more). More tokens = slower and more VRAM needed.

On a local RTX 4070 Mobile 8GB: vision tokens exceeded VRAM, so it ran on CPU (~60s/image). On OpenRouter cloud: instant regardless of resolution.

## The prompt controls what AI extracts

`backend/core/ocr/vision_engine.py` → `EXTRACT_PROMPT` — if you want to extract new fields (e.g. VAT, payment method), modify the prompt and add the field to `ReceiptData`.

Currently extracted: `merchant`, `total`, `currency`, `date`. Items list intentionally excluded (kept minimal to avoid JSON truncation with `num_predict: 512`).

## Fuel receipt detection

VisionEngine also detects `receipt_type`:
- `"grocery"` → standard `ReceiptCard`
- `"fuel"` → `FuelReceiptCard` with tabs (Fuel / Grocery) — extracts `liters`, `price_per_liter`, `location`

## Local vs cloud

```python
# backend/core/config/settings.py
LLM_BASE_URL=https://openrouter.ai/api   # cloud (default)
LLM_VISION_MODEL=google/gemini-2.5-flash-lite

# or for local Ollama:
LLM_BASE_URL=http://ollama:11434
LLM_VISION_MODEL=qwen2.5vl:7b
```

The code is provider-agnostic — uses OpenAI-compatible `/v1/chat/completions` endpoint for both.

**Note:** `LLM_BASE_URL` must NOT end with `/v1` — the code appends `/v1/chat/completions` automatically.
