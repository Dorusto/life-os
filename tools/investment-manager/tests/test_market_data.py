"""
Market-data tests.

These exist specifically to pin down the caching branch that has no live API
call to exercise: ``get_price`` is always called from ``stats.build_holdings``
with the security's own currency *string*, so the cache-annotation line must
not assume a dict. A regression there would only surface against a real
Twelve Data key, which is exactly why it is covered here with a stubbed
``_get_json``.

The rate-limiter tests drive ``_get_json`` for real with a stubbed HTTP
transport and a fake ``time`` module, so a 60-second window is asserted in
microseconds.
"""
import pytest

from app import database, market_data


def test_get_price_caches_with_string_currency(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)

    monkeypatch.setattr(market_data, "_api_key", lambda: "test-key")
    monkeypatch.setattr(market_data, "_get_json", lambda path, params: {"price": "123.45"})

    price = market_data.get_price("ACME.US", currency="USD")
    assert price == 123.45

    cached = database.get_cached_price("ACME.US")
    assert cached["price"] == 123.45
    assert cached["currency"] == "USD"


def test_get_price_serves_stale_cache_on_api_failure(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)

    database.upsert_price("ACME.US", 100.0, "USD", "2000-01-01T00:00:00+00:00")

    def boom(path, params):
        raise market_data.MarketDataError("rate limited")

    monkeypatch.setattr(market_data, "_get_json", boom)

    assert market_data.get_price("ACME.US", currency="USD") == 100.0


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
    """Stand-in for the ``time`` module whose ``sleep`` advances the clock.

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
        self.now += seconds


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


def test_get_json_waits_only_once_the_window_is_full(monkeypatch):
    """Six calls go straight through, the seventh waits out the oldest one —
    and the eighth does not wait again, proving the slot was actually freed
    rather than the limiter sleeping unconditionally."""
    clock = _FakeClock()
    _patch_transport(monkeypatch, clock, lambda *a, **k: _StubResponse())

    for _ in range(market_data.RATE_LIMIT_MAX_CALLS):
        market_data._get_json("/price", {"symbol": "ACME.US"})

    assert clock.sleeps == [], "calls inside the window must not be delayed"

    market_data._get_json("/price", {"symbol": "ACME.US"})
    assert clock.sleeps == pytest.approx([market_data.RATE_LIMIT_WINDOW_SECONDS])

    market_data._get_json("/price", {"symbol": "ACME.US"})
    assert len(clock.sleeps) == 1, "the slept call holds a slot in the new window"
    assert clock.now == pytest.approx(1_000.0 + market_data.RATE_LIMIT_WINDOW_SECONDS)


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
    assert clock.sleeps == []

    with pytest.raises(market_data.MarketDataError):
        market_data._get_json("/price", {"symbol": "ACME.US"})
    assert clock.sleeps, "the throttled call waits even though it will fail"


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
    sleeping out its own turn before also being rejected) — a ~15-20 holding
    load turned into a 15-20 minute blocking call on the single uvicorn
    worker. After the first 429, later calls must fail immediately, with no
    further sleep, until the cooldown passes."""
    clock = _FakeClock()
    _patch_transport(monkeypatch, clock, lambda *a, **k: _StubResponse429())

    with pytest.raises(market_data.MarketDataError):
        market_data._get_json("/price", {"symbol": "ACME.US"})
    slept_after_first_429 = list(clock.sleeps)

    with pytest.raises(market_data.MarketDataError):
        market_data._get_json("/time_series", {"symbol": "OTHER.US"})
    assert clock.sleeps == slept_after_first_429, "cooldown must skip _throttle entirely, no extra sleep"

    clock.now += market_data.RATE_LIMIT_COOLDOWN_SECONDS
    monkeypatch.setattr(market_data.httpx, "get", lambda *a, **k: _StubResponse())
    market_data._get_json("/price", {"symbol": "ACME.US"})  # no longer in cooldown, retries live
