"""
Market data access — keyless Yahoo Finance first, Twelve Data as an optional
fallback, both behind a cache.

Provider boundary is deliberately a small set of plain functions
(``get_price`` / ``get_fx_rate`` / ``get_price_history``) rather than an
abstraction layer: the logic that matters is "serve cache if fresh, else call
the API, else fall back to stale cache", and that reads better here than behind
an interface.

Yahoo's ``/v8/finance/chart`` endpoint is primary because it needs no API key
and covers the XETRA listings (``IS3N.DE``, ``SXR8.DE``) that Twelve Data's
free tier answers 404 for. Twelve Data is only tried when a key is configured
(``_twelve_data_fallback_available``); without one, a Yahoo failure goes
straight to the cache. ``_fetch_live`` is the single place that order is
expressed.

Caching rules (plan section 4): a personal dashboard, not a trading terminal —
refresh at most once per day per ticker/pair. If a live call fails (network,
rate limit, unknown ticker) and *any* cached value exists, the cached value is
served rather than failing the whole page; only a total cache miss raises. A
stale price beats a broken dashboard, and a raised ``MarketDataError`` lets the
route layer decide whether a missing value is fatal or just shows as "—" in the
UI.

Nothing on these paths sleeps. The Twelve Data throttle refuses a call that
would exceed the per-minute window instead of blocking on it, because blocking
the single uvicorn worker froze every other request — pages and ``/health``
alike — for up to a minute per ticker.
"""
import logging
import os
import time
from collections import deque
from datetime import datetime, timedelta, timezone

import httpx

from app import database

logger = logging.getLogger(__name__)

TWELVE_DATA_BASE = "https://api.twelvedata.com"

# Yahoo's chart endpoint is keyless and covers the XETRA listings Twelve Data's
# free tier 404s on. It also verifies the client: without a browser-like
# User-Agent it answers 429 whatever the request rate (checked live 2026-09-23).
YAHOO_BASE = "https://query1.finance.yahoo.com"
YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0"}
YAHOO_TIMEOUT_SECONDS = 8.0

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
_TRANSIENT_ERROR_MARKERS = (
    "rate limit cooldown active", "rate limit exceeded", "rate limit reached",
)


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


def provider_summary() -> str:
    """Which providers the client actually uses, for the Settings response.

    Yahoo is always available (it needs no key); Twelve Data only ever
    contributes once a key is configured, so there are exactly two states.
    """
    return "yahoo+twelvedata" if api_key_source() is not None else "yahoo"


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
    """Take a slot in the per-minute window, or refuse the call immediately.

    Sliding window over *attempted* calls: each call stamps itself before it
    goes out, and once the window holds RATE_LIMIT_MAX_CALLS stamps a further
    caller raises instead of waiting. Stamping the attempt rather than the
    success is the safer reading of "8 credits per minute" — Twelve Data spends
    a credit on a request it then refuses (HTTP 200 with a ``status: "error"``
    body), so a burst of rejected calls must not be able to slip past and keep
    the client permanently over quota.

    Deliberately never sleeps. It used to block until the oldest stamp aged
    out, which on the single uvicorn worker froze every other request — pages
    and ``/health`` included — for up to a minute per ticker, so a live
    dashboard load could hang for a quarter of an hour. Failing fast lets the
    caller fall back to cached values instead, while the window still bounds the
    real quota.

    A bare deque needs no lock here because this service runs a single uvicorn
    worker and every caller reaches this function on the same event-loop
    thread.
    """
    now = time.monotonic()
    while _call_timestamps and now - _call_timestamps[0] >= RATE_LIMIT_WINDOW_SECONDS:
        _call_timestamps.popleft()
    if len(_call_timestamps) >= RATE_LIMIT_MAX_CALLS:
        logger.info(
            "Twelve Data rate limit reached (%d calls in the last %.0fs), refusing call",
            len(_call_timestamps), RATE_LIMIT_WINDOW_SECONDS,
        )
        raise MarketDataError("Twelve Data rate limit reached, try again later")
    _call_timestamps.append(now)


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

    Still a blocking ``httpx`` call, despite being reached from ``async def``
    routes, but no longer a *waiting* one: the throttle refuses an over-quota
    call immediately (see ``_throttle``) and every request has a 10s timeout, so
    a request can no longer hold the single event-loop thread for minutes. At
    personal scale that is a fair trade; if it ever stops being one, move the
    call sites onto a thread pool (``asyncio.to_thread``).
    """
    key = _api_key()
    params = {**params, "apikey": key}
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
            f"Twelve Data request failed: {_redact_api_key(str(exc), key)}"
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
# Yahoo Finance (keyless primary)
# ---------------------------------------------------------------------------

def _yahoo_chart(symbol: str, params: dict) -> dict:
    """GET ``/v8/finance/chart/{symbol}`` and return the first chart result.

    Raises ``MarketDataError`` on an HTTP failure, an unparseable body or a
    null result — Yahoo reports an unknown symbol as HTTP 200 with
    ``result: null`` and an ``error`` object, not as a 4xx.
    """
    try:
        resp = httpx.get(
            f"{YAHOO_BASE}/v8/finance/chart/{symbol}",
            params=params,
            headers=YAHOO_HEADERS,
            timeout=YAHOO_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        payload = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise MarketDataError(f"Yahoo request failed for {symbol}: {exc}") from exc

    chart = payload.get("chart") if isinstance(payload, dict) else None
    if not isinstance(chart, dict):
        raise MarketDataError(f"Unexpected Yahoo response for {symbol}")
    result = chart.get("result")
    if not result:
        error = chart.get("error") or {}
        detail = error.get("description") or error.get("code") or "no data"
        raise MarketDataError(f"Yahoo has no data for {symbol}: {detail}")
    return result[0]


def _unix_seconds(iso_date: str | None, end_of_day: bool = False) -> int:
    """Unix seconds for a ``YYYY-MM-DD`` string (now when None).

    ``end_of_day`` pushes the timestamp past the end of the requested date, so a
    ``period2`` bound includes that day's session rather than stopping at its
    00:00.
    """
    if not iso_date:
        return int(datetime.now(timezone.utc).timestamp())
    parsed = datetime.fromisoformat(iso_date)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if end_of_day:
        parsed += timedelta(days=1)
    return int(parsed.timestamp())


def _yahoo_price(ticker: str) -> tuple[float, str | None]:
    """Latest Yahoo price, with the provider's own currency for annotation."""
    result = _yahoo_chart(ticker, {"range": "5d", "interval": "1d"})
    meta = result.get("meta") or {}
    price = _to_float(meta.get("regularMarketPrice"))
    if price is None:
        raise MarketDataError(f"No price returned for {ticker}")
    return price, meta.get("currency")


def _yahoo_rate(from_currency: str, to_currency: str) -> float:
    """Yahoo FX spot rate, quoted as an ``=X`` symbol (``USDEUR=X``)."""
    price, _ = _yahoo_price(f"{from_currency}{to_currency}=X")
    return price


def _yahoo_history(ticker: str, start_date: str,
                   end_date: str | None) -> list[tuple[str, float]]:
    """Daily Yahoo closes as ``(date, close)`` pairs, oldest first."""
    result = _yahoo_chart(ticker, {
        "period1": _unix_seconds(start_date),
        "period2": _unix_seconds(end_date, end_of_day=True),
        "interval": "1d",
    })
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    points: list[tuple[str, float]] = []
    for timestamp, close in zip(timestamps, quote.get("close") or []):
        value = _to_float(close)
        if value is None:
            # Yahoo pads non-trading sessions with nulls.
            continue
        day = datetime.fromtimestamp(timestamp, timezone.utc).date().isoformat()
        points.append((day, value))
    if not points:
        raise MarketDataError(f"No price history returned for {ticker}")
    return points


def _yahoo_metadata(ticker: str) -> dict:
    """Name/currency/exchange/type from Yahoo's chart metadata."""
    result = _yahoo_chart(ticker, {"range": "1d", "interval": "1d"})
    meta = result.get("meta") or {}
    metadata = {
        "name": meta.get("longName") or meta.get("shortName"),
        "currency": meta.get("currency"),
        "exchange": meta.get("exchangeName"),
        "type": meta.get("instrumentType"),
    }
    if not any(metadata.values()):
        raise MarketDataError(f"No metadata returned for {ticker}")
    return metadata


# ---------------------------------------------------------------------------
# Twelve Data (optional fallback)
# ---------------------------------------------------------------------------

def _twelve_data_fallback_available() -> bool:
    """Whether a key is configured, i.e. whether the fallback can be used.

    Yahoo is keyless and always tried first; the rate-limited Twelve Data tier
    is only worth a call when the user has actually configured a key.
    """
    return api_key_source() is not None


def _fetch_live(label: str, yahoo_fetch, twelve_fetch):
    """Try the keyless Yahoo fetch, then Twelve Data when a key is configured.

    Returns ``(value, error)``: a ``None`` value means both providers failed
    (or the fallback was skipped for want of a key), with ``error`` describing
    the last failure so the caller can log it, record it for the Settings UI
    and serve a cached value instead.
    """
    try:
        return yahoo_fetch(), None
    except MarketDataError as exc:
        error = exc
    if not _twelve_data_fallback_available():
        logger.info("%s: Yahoo failed and no Twelve Data key is configured (%s)", label, error)
        return None, error
    try:
        return twelve_fetch(), None
    except MarketDataError as exc:
        return None, exc


def _twelve_data_price(ticker: str) -> tuple[float, str | None]:
    """Twelve Data price fallback. /price carries no currency, hence the None."""
    payload = _get_json("/price", {"symbol": ticker})
    price = _to_float(payload.get("price"))
    if price is None:
        raise MarketDataError(f"No price returned for {ticker}")
    return price, None


def _twelve_data_rate(pair: str) -> float:
    payload = _get_json("/exchange_rate", {"symbol": pair})
    rate = _to_float(payload.get("rate"))
    if rate is None or rate <= 0:
        raise MarketDataError(f"No rate returned for {pair}")
    return rate


def _twelve_data_history(ticker: str, start_date: str,
                         end_date: str | None) -> list[tuple[str, float]]:
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
    points: list[tuple[str, float]] = []
    for value in payload.get("values") or []:
        close = _to_float(value.get("close"))
        dt = value.get("datetime")
        if close is not None and dt:
            points.append((dt[:10], close))
    if not points:
        raise MarketDataError(f"No price history returned for {ticker}")
    return points


# ---------------------------------------------------------------------------
# Spot price
# ---------------------------------------------------------------------------

def get_price(ticker: str, currency: str | None = None, force: bool = False) -> float:
    """Latest price for a ticker, in its own listing currency.

    Yahoo is tried first (keyless, so it works on a fresh install); Twelve Data
    is only a fallback and only when a key is configured. ``currency`` is a
    cache annotation when a live value is fetched — it does not affect the
    request. Raises ``MarketDataError`` only when there is no live value and no
    cached one.
    """
    ticker = ticker.strip()
    cached = database.get_cached_price(ticker)
    if cached and not force and _is_fresh(cached["fetched_at"]):
        return float(cached["price"])

    result, error = _fetch_live(
        ticker,
        lambda: _yahoo_price(ticker),
        lambda: _twelve_data_price(ticker),
    )
    # _fetch_live returns (None, error) when every provider failed, so the
    # (price, currency) pair can only be unpacked from a real result.
    price, live_currency = result if result is not None else (None, None)
    if price is None:
        if error is not None:
            _record_error(ticker, error)
        if cached:
            logger.warning("Serving stale cached price for %s: %s", ticker, error)
            return float(cached["price"])
        raise error or MarketDataError(f"No price available for {ticker}")
    # Cache-annotation currency priority: caller-supplied > provider-supplied >
    # already-cached > USD. A plain ``currency`` string is common here
    # (build_holdings always passes the security's own), so this must not
    # assume a dict.
    annotation_currency = currency or live_currency or (cached or {}).get("currency") or "USD"
    database.upsert_price(ticker, price, annotation_currency, _now_iso())
    _last_errors.pop(ticker, None)
    return price


# ---------------------------------------------------------------------------
# FX
# ---------------------------------------------------------------------------

def get_fx_rate(from_currency: str, to_currency: str, force: bool = False) -> float:
    """Conversion rate from one currency to another (e.g. USD → EUR = 0.92).

    Returns 1.0 for the same currency. Yahoo's ``=X`` pair is tried first,
    Twelve Data only with a key configured; on a failed live call a stale cached
    rate is served, otherwise raises.
    """
    from_currency = (from_currency or "EUR").upper()
    to_currency = (to_currency or "EUR").upper()
    if from_currency == to_currency:
        return 1.0

    pair = f"{from_currency}{to_currency}"
    cached = database.get_cached_fx(pair)
    if cached and not force and _is_fresh(cached["fetched_at"]):
        return float(cached["rate"])

    rate, error = _fetch_live(
        pair,
        lambda: _yahoo_rate(from_currency, to_currency),
        lambda: _twelve_data_rate(pair),
    )
    if rate is None:
        if error is not None:
            _record_error(pair, error)
        if cached:
            logger.warning("Serving stale cached FX rate for %s: %s", pair, error)
            return float(cached["rate"])
        raise error or MarketDataError(f"No FX rate for {pair}")
    database.upsert_fx(pair, rate, _now_iso())
    _last_errors.pop(pair, None)
    return rate


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

    points, error = _fetch_live(
        ticker,
        lambda: _yahoo_history(ticker, start_date, end_date),
        lambda: _twelve_data_history(ticker, start_date, end_date),
    )
    if points:
        database.upsert_price_history(ticker, points, _now_iso())
        _last_errors.pop(ticker, None)
        merged = database.get_price_history(ticker)
        return [p for p in merged if p["date"] >= start_date]

    if error is not None:
        _record_error(ticker, error)
    if cached:
        logger.warning("Serving cached price history for %s: %s", ticker, error)
        return [p for p in cached if p["date"] >= start_date]
    logger.warning("No price history for %s: %s", ticker, error)
    return []


# ---------------------------------------------------------------------------
# Security metadata
# ---------------------------------------------------------------------------

def get_security_metadata(ticker: str) -> dict:
    """Best-effort name/currency/exchange/type for a ticker.

    Yahoo's chart metadata is tried first; Twelve Data's /quote is the fallback
    when a key is configured. Used only to pre-fill metadata when a user adds a
    security without typing it; a total failure returns an empty dict rather
    than blocking the add.
    """
    symbol = ticker.strip()
    try:
        return _yahoo_metadata(symbol)
    except MarketDataError as yahoo_exc:
        logger.info("No Yahoo metadata for %s: %s", symbol, yahoo_exc)
        if not _twelve_data_fallback_available():
            return {}
    try:
        payload = _get_json("/quote", {"symbol": symbol})
    except MarketDataError as exc:
        logger.info("No metadata for %s: %s", symbol, exc)
        return {}
    return {
        "name": payload.get("name"),
        "currency": payload.get("currency"),
        "exchange": payload.get("exchange"),
        "type": payload.get("type"),
    }
