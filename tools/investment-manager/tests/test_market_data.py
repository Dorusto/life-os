"""
Market-data tests.

These exist specifically to pin down the caching branch that has no live API
call to exercise: ``get_price`` is always called from ``stats.build_holdings``
with the security's own currency *string*, so the cache-annotation line must
not assume a dict. A regression there would only surface against a real
Twelve Data key, which is exactly why it is covered here with a stubbed
``_get_json``.
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
