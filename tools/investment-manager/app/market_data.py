"""
Market data access — Twelve Data prices and FX rates, behind a cache.

Provider boundary is deliberately a small set of plain functions
(``get_price`` / ``get_fx_rate`` / ``get_price_history``) rather than an
abstraction layer: the logic that matters is "serve cache if fresh, else call
the API, else fall back to stale cache", and that reads better here than behind
an interface.

Caching rules (plan section 4): a personal dashboard, not a trading terminal —
refresh at most once per day per ticker/pair, which keeps well inside Twelve
Data's free 800 calls/day. If a live call fails (rate limit, network, unknown
ticker) and *any* cached value exists, the cached value is served rather than
failing the whole page; only a total cache miss raises. A stale price beats a
broken dashboard, and a raised ``MarketDataError`` lets the route layer decide
whether a missing value is fatal or just shows as "—" in the UI.
"""
import logging
import os
from datetime import datetime, timezone

import httpx

from app import database

logger = logging.getLogger(__name__)

TWELVE_DATA_BASE = "https://api.twelvedata.com"

# One refresh per day per ticker/pair (plan section 4).
CACHE_TTL_SECONDS = 24 * 60 * 60


class MarketDataError(Exception):
    """No live value and no cached fallback is available."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _age_seconds(fetched_at: str | None) -> float:
    if not fetched_at:
        return float("inf")
    try:
        then = datetime.fromisoformat(fetched_at)
        if then.tzinfo is None:
            then = then.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - then).total_seconds()
    except ValueError:
        return float("inf")


def _is_fresh(fetched_at: str | None) -> bool:
    return _age_seconds(fetched_at) < CACHE_TTL_SECONDS


def _api_key() -> str:
    key = os.getenv("TWELVE_DATA_API_KEY", "").strip()
    if not key:
        raise MarketDataError("TWELVE_DATA_API_KEY is not configured")
    return key


def _get_json(path: str, params: dict) -> dict:
    """GET a Twelve Data endpoint and return parsed JSON, raising on failure.

    Twelve Data reports application errors with HTTP 200 and a ``status:
    "error"`` body (or an ``"error"`` field), so those are translated into a
    ``MarketDataError`` here instead of leaking a dict into callers.
    """
    params = {**params, "apikey": _api_key()}
    try:
        resp = httpx.get(f"{TWELVE_DATA_BASE}{path}", params=params, timeout=10.0)
        resp.raise_for_status()
        payload = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise MarketDataError(f"Twelve Data request failed: {exc}") from exc

    if isinstance(payload, dict) and payload.get("status") == "error":
        raise MarketDataError(payload.get("message", "Twelve Data error"))
    if isinstance(payload, dict) and payload.get("code") and payload.get("message"):
        raise MarketDataError(payload["message"])
    return payload


def _to_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Spot price
# ---------------------------------------------------------------------------

def get_price(ticker: str, currency: str | None = None, force: bool = False) -> float:
    """Latest price for a ticker, in its own listing currency.

    ``currency`` is only a cache annotation when a live value is fetched; it
    does not affect the request. Raises ``MarketDataError`` only when there is
    no live value and no cached one.
    """
    ticker = ticker.strip()
    cached = database.get_cached_price(ticker)
    if cached and not force and _is_fresh(cached["fetched_at"]):
        return float(cached["price"])

    try:
        payload = _get_json("/price", {"symbol": ticker})
        price = _to_float(payload.get("price"))
        if price is None:
            raise MarketDataError(f"No price returned for {ticker}")
        # Cache-annotation currency priority: caller-supplied > already-cached >
        # USD. A plain ``currency`` string is common here (build_holdings always
        # passes the security's own), so this must not assume a dict.
        annotation_currency = currency or (cached or {}).get("currency") or "USD"
        database.upsert_price(ticker, price, annotation_currency, _now_iso())
        return price
    except MarketDataError as exc:
        if cached:
            logger.warning("Serving stale cached price for %s: %s", ticker, exc)
            return float(cached["price"])
        raise


# ---------------------------------------------------------------------------
# FX
# ---------------------------------------------------------------------------

def get_fx_rate(from_currency: str, to_currency: str, force: bool = False) -> float:
    """Conversion rate from one currency to another (e.g. USD → EUR = 0.92).

    Returns 1.0 for the same currency. On a failed live call, a stale cached
    rate is served; otherwise raises.
    """
    from_currency = (from_currency or "EUR").upper()
    to_currency = (to_currency or "EUR").upper()
    if from_currency == to_currency:
        return 1.0

    pair = f"{from_currency}{to_currency}"
    cached = database.get_cached_fx(pair)
    if cached and not force and _is_fresh(cached["fetched_at"]):
        return float(cached["rate"])

    try:
        payload = _get_json("/exchange_rate", {"symbol": pair})
        rate = _to_float(payload.get("rate"))
        if rate is None or rate <= 0:
            raise MarketDataError(f"No rate returned for {pair}")
        database.upsert_fx(pair, rate, _now_iso())
        return rate
    except MarketDataError as exc:
        if cached:
            logger.warning("Serving stale cached FX rate for %s: %s", pair, exc)
            return float(cached["rate"])
        raise


# ---------------------------------------------------------------------------
# Historical closes
# ---------------------------------------------------------------------------

def get_price_history(ticker: str, start_date: str, end_date: str | None = None,
                      force: bool = False) -> list[dict]:
    """Daily closes for a ticker from ``start_date`` onward, oldest first.

    Returns ``[{"date": "YYYY-MM-DD", "close": float}]``. Empty list on a
    failure with no cache — historical data is a dashboard enhancement, not the
    app's reason to exist, so callers treat its absence as "not enough data yet".
    """
    ticker = ticker.strip()
    cached = database.get_price_history(ticker)
    newest_fetch = database.get_price_history_fetched_at(ticker)

    covered = bool(cached) and (cached[0]["date"] <= start_date)
    if cached and covered and not force and _is_fresh(newest_fetch):
        return [p for p in cached if p["date"] >= start_date]

    try:
        params = {
            "symbol": ticker,
            "interval": "1day",
            "start_date": start_date,
            "order": "ASC",
            "outputsize": 5000,
        }
        if end_date:
            params["end_date"] = end_date
        payload = _get_json("/time_series", params)
        values = payload.get("values") or []
        points: list[tuple[str, float]] = []
        for v in values:
            close = _to_float(v.get("close"))
            dt = v.get("datetime")
            if close is not None and dt:
                points.append((dt[:10], close))
        if points:
            database.upsert_price_history(ticker, points, _now_iso())
        merged = database.get_price_history(ticker)
        return [p for p in merged if p["date"] >= start_date]
    except MarketDataError as exc:
        if cached:
            logger.warning("Serving cached price history for %s: %s", ticker, exc)
            return [p for p in cached if p["date"] >= start_date]
        logger.warning("No price history for %s: %s", ticker, exc)
        return []


# ---------------------------------------------------------------------------
# Security metadata
# ---------------------------------------------------------------------------

def get_security_metadata(ticker: str) -> dict:
    """Best-effort name/currency for a ticker via Twelve Data's /quote.

    Used only to pre-fill metadata when a user adds a security without typing
    it; a failure returns an empty dict rather than blocking the add.
    """
    try:
        payload = _get_json("/quote", {"symbol": ticker.strip()})
    except MarketDataError as exc:
        logger.info("No metadata for %s: %s", ticker, exc)
        return {}
    return {
        "name": payload.get("name"),
        "currency": payload.get("currency"),
        "exchange": payload.get("exchange"),
        "type": payload.get("type"),
    }
