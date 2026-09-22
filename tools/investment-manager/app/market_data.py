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
import time
from collections import deque
from datetime import datetime, timezone

import httpx

from app import database

logger = logging.getLogger(__name__)

TWELVE_DATA_BASE = "https://api.twelvedata.com"

# One refresh per day per ticker/pair (plan section 4).
CACHE_TTL_SECONDS = 24 * 60 * 60

# Rate limit — Twelve Data's free "Basic" plan allows 8 API credits per minute
# (read off the account's own dashboard, 2026-09-13). Six is deliberate
# headroom below that real 8: the exact enforcement window is not documented as
# strictly rolling-60s rather than calendar-minute, and a first load across ~14
# holdings fires ~28 calls, so being caught over the limit costs far more (429s
# and blank prices) than being a quarter under it costs in latency.
RATE_LIMIT_MAX_CALLS = 6
RATE_LIMIT_WINDOW_SECONDS = 60.0

# ``time.monotonic`` stamps of calls already started inside the current sliding
# window. Bounded by RATE_LIMIT_MAX_CALLS, so it never grows.
_call_timestamps: deque[float] = deque()

# Set on an actual HTTP 429 from Twelve Data. Live-verified 2026-09-13: without
# this, one rejected call still left every *other* ticker in the same request
# queuing behind `_throttle`'s sliding window (each one sleeping, then getting
# rejected too) — a ~15-20 holding dashboard load turned into a 15-20 minute
# blocking call on the single uvicorn worker, which also starved `/health`
# (`_throttle` blocks the event loop, see `_get_json`'s own docstring) and left
# the dashboard showing €0.00 the entire time. Once the server has said no,
# further calls fail immediately from cache instead of re-attempting.
_rate_limited_until = 0.0
# Live-observed 2026-09-13: a shorter cooldown (90s) kept re-triggering a
# fresh 429 on the very first retry, each one itself spending another credit
# and pushing the real reset further out. 5 minutes trades a slower recovery
# for not continuing to hammer an account that is still over its real quota.
RATE_LIMIT_COOLDOWN_SECONDS = 300.0


def _in_cooldown() -> bool:
    return time.monotonic() < _rate_limited_until


def _enter_cooldown(seconds: float = RATE_LIMIT_COOLDOWN_SECONDS) -> None:
    global _rate_limited_until
    _rate_limited_until = time.monotonic() + max(seconds, RATE_LIMIT_COOLDOWN_SECONDS)


class MarketDataError(Exception):
    """No live value and no cached fallback is available."""


# Last refresh failure per symbol/pair, for the Settings UI's "symbols failing
# to refresh" list. In-memory and reset on restart, like the cooldown state
# above — diagnostic only, never a source of truth for pricing.
_last_errors: dict[str, str] = {}

# Transient provider-wide failures: recording these per symbol would hide the
# real per-symbol cause (a bad ticker, a paid-plan-only exchange) behind a
# message that says nothing about the symbol itself.
_TRANSIENT_ERROR_MARKERS = ("rate limit cooldown active", "rate limit exceeded")


def _record_error(symbol: str, exc: Exception) -> None:
    message = str(exc)
    if any(marker in message for marker in _TRANSIENT_ERROR_MARKERS):
        return
    _last_errors[symbol] = message


def recent_errors() -> dict[str, str]:
    """Copy of the last refresh failure per symbol/pair (diagnostic only)."""
    return dict(_last_errors)


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


def _stored_key() -> str:
    return (database.get_setting("twelve_data_api_key") or "").strip()


def _env_key() -> str:
    return os.getenv("TWELVE_DATA_API_KEY", "").strip()


def api_key_source() -> str | None:
    """Where the Twelve Data key comes from: ``"settings"``, ``"env"`` or None.

    The stored setting wins over ``TWELVE_DATA_API_KEY`` when both are present
    (user decision), so an existing .env-based setup keeps working unchanged
    until a key is saved in the UI. This is the single place that precedence is
    expressed; ``_api_key`` reads the value through it.
    """
    if _stored_key():
        return "settings"
    if _env_key():
        return "env"
    return None


def _api_key() -> str:
    """Twelve Data key, from the stored setting first, then the env var.

    Read fresh on every call (a couple of indexed SQLite lookups — one to
    resolve the source, one to read the value) rather than cached at import
    time, so a key saved through the Settings UI takes effect without a
    container restart.

    The key value is never logged and never included in a raised message.
    """
    source = api_key_source()
    if source == "settings":
        return _stored_key()
    if source == "env":
        return _env_key()
    raise MarketDataError("Twelve Data API key is not configured")


def _throttle() -> None:
    """Block until one more call fits inside the per-minute window.

    Sliding window over *attempted* calls: each call stamps itself before it
    goes out, and once the window holds RATE_LIMIT_MAX_CALLS stamps the next
    caller sleeps exactly long enough for the oldest stamp to age out, then
    takes its slot. Stamping the attempt rather than the success is the safer
    reading of "8 credits per minute" — Twelve Data spends a credit on a
    request it then refuses (HTTP 200 with a ``status: "error"`` body), so a
    burst of rejected calls must not be able to slip past and keep the client
    permanently over quota.

    A bare deque needs no lock here because this service runs a single uvicorn
    worker and every caller reaches this function on the same event-loop
    thread — see the blocking note in ``_get_json`` for why that is accepted.
    """
    while True:
        now = time.monotonic()
        while _call_timestamps and now - _call_timestamps[0] >= RATE_LIMIT_WINDOW_SECONDS:
            _call_timestamps.popleft()
        if len(_call_timestamps) < RATE_LIMIT_MAX_CALLS:
            _call_timestamps.append(now)
            return
        wait = RATE_LIMIT_WINDOW_SECONDS - (now - _call_timestamps[0])
        logger.info(
            "Twelve Data rate limit reached (%d calls in the last %.0fs), waiting %.1fs",
            len(_call_timestamps), RATE_LIMIT_WINDOW_SECONDS, wait,
        )
        time.sleep(max(wait, 0.0))


def _redact_api_key(message: str, api_key: str) -> str:
    """Strip the API key value out of a provider error message, if present.

    httpx's ``raise_for_status()`` includes the full request URL — query
    string and all — in its exception text, and the key travels as the
    ``apikey`` query parameter. These wrapped strings are exactly what gets
    logged and stored in ``_last_errors`` for the Settings UI, and the key
    must never appear in a raised message, a log line, or a response body
    (plan section 6), so it is stripped at the single point where provider
    errors are wrapped.
    """
    if api_key and api_key in message:
        return message.replace(api_key, "***")
    return message


def _get_json(path: str, params: dict) -> dict:
    """GET a Twelve Data endpoint and return parsed JSON, raising on failure.

    Twelve Data reports application errors with HTTP 200 and a ``status:
    "error"`` body (or an ``"error"`` field), so those are translated into a
    ``MarketDataError`` here instead of leaking a dict into callers.

    Deliberately blocking, despite being reached from ``async def`` routes: the
    throttle wait stops the event loop, not just the calling request. At
    personal scale (one user, one uvicorn worker) that is the right trade — it
    serialises the first-load burst instead of letting it race the rate limit,
    which a non-blocking version would. It does mean ``GET /health`` cannot be
    served while a burst is being throttled, so if the container's healthcheck
    proves flaky on first boot, move the call sites onto a thread pool
    (``asyncio.to_thread``) and give ``_throttle`` a ``threading.Lock``.
    """
    api_key = _api_key()
    params = {**params, "apikey": api_key}
    # Only after the key resolves, so a misconfigured key cannot burn a slot.
    if _in_cooldown():
        raise MarketDataError("Twelve Data rate limit cooldown active")
    _throttle()
    try:
        resp = httpx.get(f"{TWELVE_DATA_BASE}{path}", params=params, timeout=10.0)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After")
            cooldown = RATE_LIMIT_COOLDOWN_SECONDS
            if retry_after:
                try:
                    cooldown = max(cooldown, float(retry_after))
                except ValueError:
                    pass
            _enter_cooldown(cooldown)
            raise MarketDataError("Twelve Data rate limit exceeded (429)")
        resp.raise_for_status()
        payload = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise MarketDataError(
            f"Twelve Data request failed: {_redact_api_key(str(exc), api_key)}"
        ) from exc

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
        _last_errors.pop(ticker, None)
        return price
    except MarketDataError as exc:
        _record_error(ticker, exc)
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
        _last_errors.pop(pair, None)
        return rate
    except MarketDataError as exc:
        _record_error(pair, exc)
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

    # Reuse a fresh cache whenever it already reaches back as far as this
    # request needs: the common case is serving a narrower period ("1y") from a
    # cache fetched for a wider one ("5y"), or the same period again later in
    # the same burst. ``min()`` rather than ``cached[0]`` so the coverage test
    # cannot silently invert if the query's ordering ever changes — with
    # newest-first rows, ``cached[0]`` would be the *newest* date, no cache
    # would ever appear to cover its period, and every load would refetch.
    earliest_cached = min((p["date"] for p in cached), default=None)
    covered = earliest_cached is not None and earliest_cached <= start_date
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
        _last_errors.pop(ticker, None)
        return [p for p in merged if p["date"] >= start_date]
    except MarketDataError as exc:
        _record_error(ticker, exc)
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
