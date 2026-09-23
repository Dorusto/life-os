"""
Market-data tests.

No test here touches the network: Yahoo calls go through a stubbed
``httpx.get`` and the Twelve Data path through a stubbed ``_get_json``.

These exist specifically to pin down the branches with no live API call behind
them: ``get_price`` is always called from ``stats.build_holdings`` with the
security's own currency *string*, so the cache-annotation line must not assume
a dict; and the provider order (Yahoo always, Twelve Data only with a key)
decides whether a failed fetch costs a network round trip or a cache read.

The rate-limiter tests drive ``_throttle`` for real with a fake ``time`` module
whose ``sleep`` fails the test if it is ever called — nothing on the request
path may block.
"""
import pytest

from app import database, market_data


def _yahoo_chart_payload(price=123.45, currency="USD", name="Acme Corp") -> dict:
    """Minimal successful Yahoo chart response (shape verified live 2026-09-23)."""
    return {
        "chart": {
            "result": [{
                "meta": {
                    "regularMarketPrice": price,
                    "currency": currency,
                    "longName": name,
                    "exchangeName": "XNAS",
                    "instrumentType": "EQUITY",
                },
            }],
            "error": None,
        },
    }


class _YahooChartResponse:
    status_code = 200
    headers: dict = {}

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


def _patch_yahoo(monkeypatch, payload: dict) -> None:
    monkeypatch.setattr(
        market_data.httpx, "get", lambda *a, **k: _YahooChartResponse(payload)
    )


def _yahoo_network_down(*args, **kwargs):
    raise market_data.httpx.ConnectError("yahoo unreachable")


def test_get_price_uses_yahoo_first_and_needs_no_api_key(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    requests: list[tuple[str, dict]] = []

    def fake_get(url, *args, **kwargs):
        requests.append((url, kwargs))
        return _YahooChartResponse(_yahoo_chart_payload(price=48.87, currency="EUR"))

    monkeypatch.setattr(market_data.httpx, "get", fake_get)
    monkeypatch.setattr(
        market_data, "_get_json",
        lambda *a, **k: pytest.fail("Twelve Data must not be called without a key"),
    )

    assert market_data.get_price("IS3N.DE") == 48.87
    assert "query1.finance.yahoo.com" in requests[0][0]
    assert "IS3N.DE" in requests[0][0]
    # Without a browser-like User-Agent Yahoo answers 429 whatever the rate.
    assert requests[0][1]["headers"]["User-Agent"] == "Mozilla/5.0"

    cached = database.get_cached_price("IS3N.DE")
    assert cached["price"] == 48.87
    assert cached["currency"] == "EUR"

    # A second call inside the 24h TTL is served from cache, not from Yahoo.
    assert market_data.get_price("IS3N.DE") == 48.87
    assert len(requests) == 1


def test_get_fx_rate_uses_yahoo_pair_symbol(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    urls: list[tuple[str, dict]] = []

    def fake_get(url, *args, **kwargs):
        urls.append((url, kwargs))
        return _YahooChartResponse(_yahoo_chart_payload(price=0.8785, currency="EUR"))

    monkeypatch.setattr(market_data.httpx, "get", fake_get)

    assert market_data.get_fx_rate("USD", "EUR") == pytest.approx(0.8785)
    assert "USDEUR=X" in urls[0][0]


def test_get_price_history_skips_yahoo_null_closes(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    # 2026-01-01 / 01-02 / 01-03, middle close nulled like a Yahoo holiday pad.
    _patch_yahoo(monkeypatch, {"chart": {"result": [{
        "timestamp": [1767225600, 1767312000, 1767398400],
        "indicators": {"quote": [{"close": [48.87, None, 49.5]}]},
    }], "error": None}})

    points = market_data.get_price_history("IS3N.DE", "2026-01-01")
    assert [p["close"] for p in points] == [48.87, 49.5]
    assert [p["date"] for p in points] == ["2026-01-01", "2026-01-03"]


def test_get_price_caches_with_string_currency(monkeypatch, tmp_path):
    """``build_holdings`` passes the security's currency *string*; it must not be
    read as a dict. (A provider quoting another currency is converted instead —
    see test_get_price_converts_pence_and_foreign_listing_currency.)"""
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)
    _patch_yahoo(monkeypatch, _yahoo_chart_payload(price="123.45", currency="USD"))

    price = market_data.get_price("ACME.US", currency="USD")
    assert price == 123.45

    cached = database.get_cached_price("ACME.US")
    assert cached["price"] == 123.45
    assert cached["currency"] == "USD"


def test_get_price_serves_stale_cache_when_yahoo_fails_and_no_key(
    monkeypatch, tmp_path
):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    database.upsert_price("ACME.US", 100.0, "USD", "2000-01-01T00:00:00+00:00")

    monkeypatch.setattr(market_data.httpx, "get", _yahoo_network_down)
    monkeypatch.setattr(
        market_data, "_get_json",
        lambda *a, **k: pytest.fail("Twelve Data must not be called without a key"),
    )

    assert market_data.get_price("ACME.US", currency="USD") == 100.0


def test_get_price_falls_back_to_twelve_data_when_a_key_is_configured(
    monkeypatch, tmp_path
):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.setattr(market_data.httpx, "get", _yahoo_network_down)
    database.set_setting("twelve_data_api_key", "stored-key")

    calls: list[tuple[str, dict]] = []

    def fake_get_json(path, params):
        calls.append((path, params))
        return {"price": "123.45"}

    monkeypatch.setattr(market_data, "_get_json", fake_get_json)

    assert market_data.get_price("ACME.US", currency="USD") == 123.45
    assert calls == [("/price", {"symbol": "ACME.US"})]


def test_api_key_prefers_stored_setting_over_env(monkeypatch, tmp_path):
    """A key saved via the Settings UI must win over the environment variable,
    and must be picked up without a re-import/restart."""
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)

    monkeypatch.setenv("TWELVE_DATA_API_KEY", "env-key")
    assert market_data._api_key() == "env-key"

    database.set_setting("twelve_data_api_key", "stored-key")
    assert market_data._api_key() == "stored-key"


def test_api_key_missing_raises_without_leaking(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    with pytest.raises(market_data.MarketDataError):
        market_data._api_key()


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

class _FakeClock:
    """Stand-in for the ``time`` module that fails the test if anyone sleeps.

    ``market_data.time`` is patched wholesale, rather than the stdlib
    ``time.sleep``/``time.monotonic`` attributes, so the fake reaches only this
    module — a monkeypatched global sleep would be felt by pytest and httpx too.
    """

    def __init__(self) -> None:
        self.now = 1_000.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        raise AssertionError(f"market_data must never sleep, slept {seconds}s")


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    """The sliding window and the 429 cooldown are module-level state: a burst
    or a rejection in one test must not affect the next test's first call."""
    market_data._call_timestamps.clear()
    market_data._rate_limited_until = 0.0
    yield
    market_data._call_timestamps.clear()
    market_data._rate_limited_until = 0.0


class _StubResponse:
    status_code = 200
    headers: dict = {}

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"price": "1.0"}


def _patch_transport(monkeypatch, clock, get):
    monkeypatch.setattr(market_data, "time", clock)
    monkeypatch.setattr(market_data, "_api_key", lambda: "test-key")
    monkeypatch.setattr(market_data.httpx, "get", get)


def test_throttle_refuses_the_call_once_the_window_is_full(monkeypatch):
    """Six calls go straight through; the seventh fails fast instead of waiting
    out the oldest slot (the old behaviour, which froze the single uvicorn
    worker) — and once that slot ages out the next call is admitted again."""
    clock = _FakeClock()
    _patch_transport(monkeypatch, clock, lambda *a, **k: _StubResponse())

    for _ in range(market_data.RATE_LIMIT_MAX_CALLS):
        market_data._get_json("/price", {"symbol": "ACME.US"})

    with pytest.raises(market_data.MarketDataError, match="rate limit reached"):
        market_data._get_json("/price", {"symbol": "ACME.US"})
    assert clock.sleeps == [], "an over-quota call must be refused, never waited out"

    # The window slides on its own, so the slot is genuinely freed.
    clock.now += market_data.RATE_LIMIT_WINDOW_SECONDS
    market_data._get_json("/price", {"symbol": "ACME.US"})
    assert clock.sleeps == []


def test_rejected_calls_still_consume_the_window(monkeypatch):
    """A refused request spends an API credit, so it must be counted — otherwise
    a run of failures would leave the client permanently over the real quota."""
    clock = _FakeClock()

    def refuse(*args, **kwargs):
        raise market_data.httpx.HTTPError("429 Too Many Requests")

    _patch_transport(monkeypatch, clock, refuse)

    for _ in range(market_data.RATE_LIMIT_MAX_CALLS):
        with pytest.raises(market_data.MarketDataError):
            market_data._get_json("/price", {"symbol": "ACME.US"})

    # The window is full, so the next attempt is refused before any HTTP call.
    with pytest.raises(market_data.MarketDataError, match="rate limit reached"):
        market_data._get_json("/price", {"symbol": "ACME.US"})
    assert clock.sleeps == []


class _StubResponse429:
    status_code = 429
    headers: dict = {}

    def raise_for_status(self) -> None:
        raise AssertionError("must not be reached — 429 is handled before raise_for_status")

    def json(self) -> dict:
        raise AssertionError("must not be reached")


def test_429_enters_cooldown_and_skips_remaining_calls_without_waiting(monkeypatch):
    """Live bug, 2026-09-13: one 429 used to leave every other ticker in the
    same dashboard load still queuing behind the sliding window (each one
    waiting out its own turn before also being rejected) — a ~15-20 holding
    load turned into a 15-20 minute blocking call on the single uvicorn
    worker. After the first 429, later calls must fail immediately, with no
    wait at all, until the cooldown passes."""
    clock = _FakeClock()
    _patch_transport(monkeypatch, clock, lambda *a, **k: _StubResponse429())

    with pytest.raises(market_data.MarketDataError):
        market_data._get_json("/price", {"symbol": "ACME.US"})
    assert clock.sleeps == []

    with pytest.raises(market_data.MarketDataError):
        market_data._get_json("/time_series", {"symbol": "OTHER.US"})
    assert clock.sleeps == [], "cooldown must skip _throttle entirely, no sleep"

    clock.now += market_data.RATE_LIMIT_COOLDOWN_SECONDS
    monkeypatch.setattr(market_data.httpx, "get", lambda *a, **k: _StubResponse())
    market_data._get_json("/price", {"symbol": "ACME.US"})  # no longer in cooldown, retries live


def test_yahoo_symbol_maps_broker_suffixes():
    assert market_data._yahoo_symbol("EGLN.UK") == "EGLN.L"
    assert market_data._yahoo_symbol("INTC.US") == "INTC"
    assert market_data._yahoo_symbol("SXR8.DE") == "SXR8.DE"
    assert market_data._yahoo_symbol("USDEUR=X") == "USDEUR=X"


def test_get_price_converts_pence_and_foreign_listing_currency(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)
    requested = []

    def fake_chart(symbol, params):
        requested.append(symbol)
        if symbol == "GBPUSD=X":
            return {"meta": {"regularMarketPrice": 1.25, "currency": "USD"}}
        return {"meta": {"regularMarketPrice": 5000.0, "currency": "GBp"}}

    monkeypatch.setattr(market_data, "_yahoo_chart", fake_chart)
    # 5000 pence = 50 GBP, at 1.25 USD per GBP = 62.5 USD
    assert market_data.get_price("ABC.UK", currency="USD") == pytest.approx(62.5)
    assert requested[0] == "ABC.UK"
