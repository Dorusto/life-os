"""
Settings response tests — the API key's write-only property in particular.

The key can be *set* through PUT /settings but must never come back out of GET
or PUT (plan section 6), so the response-shaping and the configured-vs-not
flag are pinned here. A regression that leaked the key into
``_public_settings()`` would otherwise only be visible by eyeballing JSON.
"""
from app import database, main, market_data


def test_public_settings_never_include_api_key(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    # database.get_settings() would happily return the raw row, so the
    # response helper is the one place that has to strip it.
    assert main._market_data_configured() is False

    database.set_setting("twelve_data_api_key", "super-secret")

    assert main._market_data_configured() is True
    settings = main._public_settings()
    assert "twelve_data_api_key" not in settings
    assert "super-secret" not in str(settings)


def test_market_data_configured_falls_back_to_env(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)

    monkeypatch.setenv("TWELVE_DATA_API_KEY", "env-key")
    assert main._market_data_configured() is True


def test_api_key_source_prefers_stored_key(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.setenv("TWELVE_DATA_API_KEY", "env-key")

    database.set_setting("twelve_data_api_key", "stored-key")

    # Stored key wins even when the env var is also set (user decision).
    assert market_data.api_key_source() == "settings"


def test_api_key_source_falls_back_to_env(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.setenv("TWELVE_DATA_API_KEY", "env-key")

    assert market_data.api_key_source() == "env"


def test_api_key_source_none_when_unset(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    assert market_data.api_key_source() is None


def test_public_settings_expose_source_and_errors(monkeypatch, tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    monkeypatch.setattr(database, "get_db_path", lambda: db_path)
    monkeypatch.delenv("TWELVE_DATA_API_KEY", raising=False)

    database.set_setting("twelve_data_api_key", "super-secret")
    monkeypatch.setattr(
        market_data, "_last_errors", {"AAPL": "symbol AAPL is missing or invalid"}
    )

    settings = main._public_settings()
    assert settings["market_data_source"] == "settings"
    assert settings["market_data_errors"] == {"AAPL": "symbol AAPL is missing or invalid"}
    # The key itself still never leaves the backend.
    assert "twelve_data_api_key" not in settings
    assert "super-secret" not in str(settings)


def test_error_messages_never_carry_the_api_key():
    # httpx's raise_for_status() embeds the full request URL — apikey query
    # parameter included — in its exception text, and that wrapped string is
    # exactly what _record_error stores for the Settings UI and what the
    # stale-cache log lines print. The key must never survive into either.
    # The placeholder uses the change_this_to_ prefix the private-data scanner
    # whitelists — a bare fake value inside a URL reads as a real credential.
    message = (
        "Twelve Data request failed: Server error '500 Internal Server Error'"
        " for url 'https://api.twelvedata.com/price?symbol=AAPL&apikey=change_this_to_a_real_key'"
    )
    redacted = market_data._redact_api_key(message, "change_this_to_a_real_key")
    assert "change_this_to_a_real_key" not in redacted
    assert "symbol=AAPL" in redacted
    # A message that never contained the key passes through unchanged.
    assert market_data._redact_api_key("no key here", "change_this_to_a_real_key") == "no key here"
